/**
 * ============================================================================
 * LOGIKA APLIKASI 1: PRESENSI GURU SMP N 1 MEKARJAYA
 * ============================================================================
 */

const GURU_APP = (() => {
  let state = SAMEJA_CORE.loadLocalState();
  let adminUnlocked = false;
  let currentCoords = null;
  let currentDistance = null;
  let capturedPhotoBase64 = '';
  let mediaStream = null;
  let facingMode = 'user';
  let selectedKeterangan = 'Hadir';
  let selectedSubHadir = 'Datang';
  let chartInstance = null;

  /* -------------------- 1. INISIALISASI & SPLASH SCREEN -------------------- */
  async function init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // Splash screen tepat 2 detik
    setTimeout(() => {
      const splash = document.getElementById('splash-screen');
      if (splash) splash.classList.add('hidden');
    }, 2000);

    applyBrandingLogos();
    bindEvents();
    startLiveClock();
    startGpsWatcher();
    startLiveCamera();
    renderAll();

    // Sinkronisasi data terpusat Google Sheets di latar belakang
    const syncRes = await SAMEJA_CORE.syncFromServer();
    state = syncRes.state;
    updateSyncPill(syncRes.online);
    applyBrandingLogos();
    renderAll();

    // Polling ringan setiap 25 detik agar update Ruang Kelas & Guru lintas perangkat langsung terlihat
    setInterval(async () => {
      const res = await SAMEJA_CORE.syncFromServer();
      state = res.state;
      updateSyncPill(res.online);
      renderRuangKelas();
      renderGuruDropdown();
    }, 25000);

    window.addEventListener('online', async () => {
      const res = await SAMEJA_CORE.syncFromServer();
      state = res.state;
      updateSyncPill(res.online);
      renderAll();
    });
    window.addEventListener('offline', () => updateSyncPill(false));
  }

  function updateSyncPill(isOnline) {
    const pill = document.getElementById('sync-status-pill');
    const txt = document.getElementById('sync-status-text');
    const outboxCount = SAMEJA_CORE.getOutbox().length;
    if (isOnline) {
      pill.className = 'sync-pill online';
      txt.textContent = outboxCount > 0 ? `Sync (${outboxCount})` : 'Online';
    } else {
      pill.className = 'sync-pill offline';
      txt.textContent = outboxCount > 0 ? `Lokal (${outboxCount})` : 'Offline';
    }
  }

  function applyBrandingLogos() {
    const logoSekolah = state.config.logoSekolah || './assets/logo-sekolah.png';
    const logoPemkab = state.config.logoPemkab || './assets/logo-pemkab.png';
    ['splash-logo-img', 'header-logo-sekolah', 'preview-logo-sekolah'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.src = logoSekolah;
    });
    const elPemkab = document.getElementById('preview-logo-pemkab');
    if (elPemkab) elPemkab.src = logoPemkab;
  }

  /* -------------------- 2. NAVIGASI & AUTO-LOCK ADMIN -------------------- */
  function switchTab(tabName) {
    SAMEJA_CORE.playSound('click');

    // Kunci kembali menu Admin secara otomatis setiap kali berpindah menu
    if (tabName !== 'admin' && adminUnlocked) {
      adminUnlocked = false;
      document.getElementById('admin-lock-box').style.display = 'block';
      document.getElementById('admin-unlocked-content').style.display = 'none';
      document.getElementById('admin-pass-input').value = '';
    }

    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.section-panel').forEach((sec) => {
      sec.classList.toggle('active', sec.id === `panel-${tabName}`);
    });

    if (tabName === 'presensi') {
      if (!capturedPhotoBase64) startLiveCamera();
    } else {
      stopLiveCamera();
    }

    if (tabName === 'galeri') renderGaleri();
    if (tabName === 'daftar') renderDaftarKehadiran();
    if (tabName === 'statistik') renderStatistik();
    if (tabName === 'ruangkelas') renderRuangKelas();
  }

  /* -------------------- 3. WAKTU LIVE & GPS RADIUS 500M -------------------- */
  function startLiveClock() {
    const update = () => {
      const parts = SAMEJA_CORE.getIndoDateParts(new Date());
      document.getElementById('live-date-text').textContent = parts.tanggalText;
      document.getElementById('live-clock-text').textContent = `${parts.jam} WIB`;
      const wm = document.getElementById('camera-watermark');
      if (wm) {
        const gpsStr = currentCoords
          ? SAMEJA_CORE.formatCoord(currentCoords.lat, currentCoords.lng)
          : 'Mencari GPS...';
        wm.innerHTML = `${parts.tanggalText} • ${parts.jam} WIB<br>GPS: ${gpsStr}`;
      }
    };
    update();
    setInterval(update, 1000);
  }

  function startGpsWatcher() {
    if (!('geolocation' in navigator)) {
      document.getElementById('live-gps-coord').textContent = 'GPS tidak didukung perangkat';
      return;
    }
    navigator.geolocation.watchPosition(
      (pos) => {
        currentCoords = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6))
        };
        const centerLat = Number(state.config.centerLat || -6.36485);
        const centerLng = Number(state.config.centerLng || 105.98214);
        const radiusMax = Number(state.config.radiusMeters || 500);
        currentDistance = SAMEJA_CORE.calculateDistanceMeters(
          currentCoords.lat,
          currentCoords.lng,
          centerLat,
          centerLng
        );

        document.getElementById('live-gps-coord').textContent = SAMEJA_CORE.formatCoord(
          currentCoords.lat,
          currentCoords.lng
        );

        const statusEl = document.getElementById('live-gps-status');
        const warnBox = document.getElementById('radius-warning-box');
        if (currentDistance <= radiusMax) {
          statusEl.innerHTML = `<span style="color:var(--emerald);font-weight:800;"><i class="fa-solid fa-circle-check"></i> Dalam Radius Sekolah (${currentDistance} m dari titik pusat)</span>`;
          warnBox.style.display = 'none';
        } else {
          statusEl.innerHTML = `<span style="color:var(--danger);font-weight:800;"><i class="fa-solid fa-triangle-exclamation"></i> Di Luar Radius Sekolah (${currentDistance} m / Maks ${radiusMax} m)</span>`;
          warnBox.style.display = selectedKeterangan === 'Hadir' ? 'block' : 'none';
        }
      },
      (err) => {
        document.getElementById('live-gps-coord').textContent = 'Izin lokasi GPS diperlukan';
        document.getElementById('live-gps-status').textContent = err.message;
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  /* -------------------- 4. KAMERA LIVE RASIO 4:3 PORTRAIT -------------------- */
  async function startLiveCamera() {
    stopLiveCamera();
    const video = document.getElementById('live-video');
    const preview = document.getElementById('captured-photo-preview');
    video.style.display = 'block';
    preview.style.display = 'none';
    video.classList.toggle('mirror', facingMode === 'user');

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode, width: { ideal: 720 }, height: { ideal: 960 } },
        audio: false
      });
      video.srcObject = mediaStream;
    } catch (_) {
      document.getElementById('camera-watermark').textContent =
        'Kamera tidak dapat diakses. Pastikan izin kamera diaktifkan.';
    }
  }

  function stopLiveCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
  }

  function capturePortraitPhoto() {
    const video = document.getElementById('live-video');
    if (!video || !video.videoWidth) {
      SAMEJA_CORE.playSound('error');
      alert('Kamera belum siap. Tunggu sebentar hingga gambar kamera muncul.');
      return;
    }

    SAMEJA_CORE.playSound('shutter');
    const canvas = document.getElementById('capture-canvas');
    // Rasio 4:3 Portrait -> lebar 360 x tinggi 480 (proporsi 3:4 tegak)
    canvas.width = 360;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const targetAspect = 3 / 4;
    const videoAspect = vw / vh;

    let sx = 0, sy = 0, sWidth = vw, sHeight = vh;
    if (videoAspect > targetAspect) {
      sWidth = vh * targetAspect;
      sx = (vw - sWidth) / 2;
    } else {
      sHeight = vw / targetAspect;
      sy = (vh - sHeight) / 2;
    }

    ctx.save();
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    // Watermark waktu & lokasi pada foto
    const parts = SAMEJA_CORE.getIndoDateParts(new Date());
    const gpsText = currentCoords
      ? SAMEJA_CORE.formatCoord(currentCoords.lat, currentCoords.lng)
      : 'Offline GPS';
    ctx.fillStyle = 'rgba(11, 34, 57, 0.78)';
    ctx.fillRect(0, canvas.height - 46, canvas.width, 46);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`SAMEJA 2027 • ${parts.tanggalText} ${parts.jam}`, 10, canvas.height - 26);
    ctx.fillStyle = '#fde047';
    ctx.fillText(`GPS: ${gpsText}`, 10, canvas.height - 10);

    capturedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.65);

    const preview = document.getElementById('captured-photo-preview');
    preview.src = capturedPhotoBase64;
    preview.style.display = 'block';
    video.style.display = 'none';
    document.getElementById('btn-take-photo').style.display = 'none';
    document.getElementById('btn-retake-photo').style.display = 'inline-flex';
    stopLiveCamera();
  }

  /* -------------------- 5. KIRIM PRESENSI GURU -------------------- */
  async function handleSubmitPresensi() {
    const guruId = document.getElementById('select-guru-presensi').value;
    if (!guruId) {
      SAMEJA_CORE.playSound('error');
      return alert('Silakan pilih Nama Guru terlebih dahulu.');
    }
    const guruObj = state.guru.find((g) => String(g.id) === String(guruId));
    if (!guruObj) return;

    if (!capturedPhotoBase64) {
      SAMEJA_CORE.playSound('error');
      return alert('Silakan ambil Foto Live terlebih dahulu sebelum mengirim presensi.');
    }

    const radiusMax = Number(state.config.radiusMeters || 500);
    if (selectedKeterangan === 'Hadir') {
      if (!currentCoords || currentDistance === null) {
        SAMEJA_CORE.playSound('error');
        return alert('Lokasi GPS belum terdeteksi. Aktifkan GPS perangkat Anda.');
      }
      if (currentDistance > radiusMax) {
        SAMEJA_CORE.playSound('error');
        document.getElementById('radius-warning-box').style.display = 'block';
        return alert(`Anda diluar radius sekolah!\nJarak terukur: ${currentDistance} meter (Maksimal ${radiusMax} meter).`);
      }
    }

    let keteranganText = '';
    let tempatText = '';
    if (selectedKeterangan === 'Sakit') {
      keteranganText = document.getElementById('input-ket-sakit').value.trim();
      if (!keteranganText) {
        SAMEJA_CORE.playSound('error');
        return alert('Keterangan Sakit wajib diisi!');
      }
    } else if (selectedKeterangan === 'Izin') {
      keteranganText = document.getElementById('input-ket-izin').value.trim();
      if (!keteranganText) {
        SAMEJA_CORE.playSound('error');
        return alert('Keterangan Izin wajib diisi!');
      }
    } else if (selectedKeterangan === 'Dinas Luar') {
      keteranganText = document.getElementById('input-ket-kegiatan').value.trim();
      tempatText = document.getElementById('input-ket-tempat').value.trim();
      if (!keteranganText || !tempatText) {
        SAMEJA_CORE.playSound('error');
        return alert('Keterangan Kegiatan dan Tempat Dinas Luar wajib diisi!');
      }
    } else {
      keteranganText = `Presensi ${selectedSubHadir}`;
      tempatText = 'SMP N 1 Mekarjaya';
    }

    const now = new Date();
    const parts = SAMEJA_CORE.getIndoDateParts(now);
    const record = {
      id: `PG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tanggal: parts.isoDate,
      hari: parts.hari,
      waktu: parts.jam,
      timestamp: now.toISOString(),
      guruId: guruObj.id,
      guruNama: guruObj.nama,
      guruNip: guruObj.nip,
      jenis: selectedKeterangan,
      subJenis: selectedKeterangan === 'Hadir' ? selectedSubHadir : '',
      keterangan: keteranganText,
      tempat: tempatText,
      lat: currentCoords ? String(currentCoords.lat) : '',
      lng: currentCoords ? String(currentCoords.lng) : '',
      jarakMeter: currentDistance || 0,
      fotoBase64: capturedPhotoBase64
    };

    state.presensiGuru.unshift(record);
    SAMEJA_CORE.saveLocalState(state);
    SAMEJA_CORE.playSound('success');

    // Reset form foto & isian
    capturedPhotoBase64 = '';
    document.getElementById('btn-take-photo').style.display = 'inline-flex';
    document.getElementById('btn-retake-photo').style.display = 'none';
    document.getElementById('input-ket-sakit').value = '';
    document.getElementById('input-ket-izin').value = '';
    document.getElementById('input-ket-kegiatan').value = '';
    document.getElementById('input-ket-tempat').value = '';
    startLiveCamera();
    renderAll();

    alert(`Presensi ${record.jenis} (${guruObj.nama}) berhasil dicatat pada ${parts.fullText}!`);

    const syncRes = await SAMEJA_CORE.sendAction({ action: 'addPresensiGuru', item: record });
    state = syncRes.state;
    updateSyncPill(syncRes.synced);
  }

  /* -------------------- 6. RENDER DROPDOWN, ADMIN, GALERI, DAFTAR, STATISTIK, KELAS -------------------- */
  function renderGuruDropdown() {
    const sel = document.getElementById('select-guru-presensi');
    const statSel = document.getElementById('stat-select-guru');
    const prevVal = sel.value;
    const prevStat = statSel.value;

    sel.innerHTML = '<option value="">-- Pilih Nama Guru --</option>';
    statSel.innerHTML = '<option value="ALL">Seluruh Guru (Kelompok)</option>';

    state.guru.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = `${g.nama} — NIP. ${g.nip}`;
      sel.appendChild(opt);

      const opt2 = document.createElement('option');
      opt2.value = g.id;
      opt2.textContent = g.nama;
      statSel.appendChild(opt2);
    });

    sel.value = prevVal;
    statSel.value = prevStat || 'ALL';
  }

  function renderAdminGuruList() {
    const wrap = document.getElementById('admin-guru-list');
    document.getElementById('cfg-gas-url').value = SAMEJA_CORE.getGasUrl();
    document.getElementById('cfg-center-lat').value = state.config.centerLat || '';
    document.getElementById('cfg-center-lng').value = state.config.centerLng || '';

    wrap.innerHTML = state.guru
      .map(
        (g) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:11px;background:#f8fafc;">
        <div>
          <div style="font-weight:800;font-size:0.92rem;color:var(--primary);">${g.nama}</div>
          <div style="font-size:0.75rem;color:var(--muted);">NIP. ${g.nip}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-outline" style="padding:6px 10px;font-size:0.78rem;" onclick="GURU_APP.editGuru('${g.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger" style="padding:6px 10px;font-size:0.78rem;" onclick="GURU_APP.deleteGuru('${g.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`
      )
      .join('');
  }

  function renderGaleri() {
    const grid = document.getElementById('galeri-grid');
    const q = (document.getElementById('galeri-search').value || '').toLowerCase();
    const cat = document.getElementById('galeri-filter-kategori').value;
    const sort = document.getElementById('galeri-sort').value;

    let list = state.presensiGuru.filter((p) => {
      const catKey = p.jenis === 'Hadir' ? `Hadir-${p.subJenis}` : p.jenis;
      if (cat !== 'ALL' && catKey !== cat) return false;
      const hay = `${p.guruNama} ${p.tanggal} ${p.jenis} ${p.subJenis} ${p.keterangan}`.toLowerCase();
      return hay.includes(q);
    });

    list.sort((a, b) => {
      if (sort === 'oldest') return new Date(a.timestamp) - new Date(b.timestamp);
      if (sort === 'name') return a.guruNama.localeCompare(b.guruNama);
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    if (list.length === 0) {
      grid.innerHTML = '<p style="color:var(--muted);grid-column:1/-1;text-align:center;padding:24px;">Belum ada foto presensi live yang sesuai filter.</p>';
      return;
    }

    grid.innerHTML = list
      .map(
        (p) => `
      <div class="gallery-card">
        <img class="gallery-card-img" src="${p.fotoBase64 || './assets/logo-sekolah.png'}" alt="${p.guruNama}" />
        <div class="gallery-card-body">
          <div style="font-weight:800;font-size:0.82rem;color:var(--primary);">${p.guruNama}</div>
          <div style="font-size:0.68rem;color:var(--muted);">NIP. ${p.guruNip}</div>
          <div style="margin:5px 0;">
            <span class="badge ${p.jenis === 'Hadir' ? 'badge-baik' : 'badge-cukup'}">
              ${p.jenis}${p.subJenis ? ' • ' + p.subJenis : ''}
            </span>
          </div>
          <div style="font-size:0.7rem;color:#334155;">${p.hari}, ${p.tanggal} (${p.waktu})</div>
          <div style="font-size:0.67rem;color:var(--muted);">GPS: ${p.lat}, ${p.lng}</div>
        </div>
      </div>`
      )
      .join('');
  }

  function getFilteredLogs() {
    const q = (document.getElementById('daftar-search').value || '').toLowerCase();
    const grp = document.getElementById('daftar-group-time').value;
    const cat = document.getElementById('daftar-filter-cat').value;
    const sort = document.getElementById('daftar-sort').value;
    const now = new Date();
    const todayIso = SAMEJA_CORE.getIndoDateParts(now).isoDate;

    const startOfWeek = new Date(now);
    const day = now.getDay() || 7;
    startOfWeek.setDate(now.getDate() - day + 1);
    startOfWeek.setHours(0, 0, 0, 0);

    let list = state.presensiGuru.filter((p) => {
      if (cat !== 'ALL' && p.jenis !== cat) return false;
      if (grp === 'today' && p.tanggal !== todayIso) return false;
      if (grp === 'week' && new Date(p.timestamp) < startOfWeek) return false;
      if (grp === 'month' && !p.tanggal.startsWith(todayIso.slice(0, 7))) return false;
      if (grp === 'year' && !p.tanggal.startsWith(todayIso.slice(0, 4))) return false;
      const hay = `${p.guruNama} ${p.guruNip} ${p.keterangan} ${p.tempat} ${p.tanggal}`.toLowerCase();
      return hay.includes(q);
    });

    list.sort((a, b) => {
      if (sort === 'oldest') return new Date(a.timestamp) - new Date(b.timestamp);
      if (sort === 'name') return a.guruNama.localeCompare(b.guruNama);
      if (sort === 'status') return a.jenis.localeCompare(b.jenis);
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    return list;
  }

  function renderDaftarKehadiran() {
    const tbody = document.getElementById('daftar-kehadiran-tbody');
    const list = getFilteredLogs();
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px;">Belum ada data presensi.</td></tr>';
      return;
    }
    tbody.innerHTML = list
      .map(
        (p, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${p.hari}, ${p.tanggal}</strong><br><span style="color:var(--muted);font-size:0.75rem;">${p.waktu} WIB</span></td>
        <td><strong>${p.guruNama}</strong><br><span style="color:var(--muted);font-size:0.74rem;">NIP. ${p.guruNip}</span></td>
        <td><span class="badge ${p.jenis === 'Hadir' ? 'badge-baik' : 'badge-cukup'}">${p.jenis}${p.subJenis ? ' (' + p.subJenis + ')' : ''}</span></td>
        <td>${p.keterangan || '-'}${p.tempat ? ' — <em>' + p.tempat + '</em>' : ''}<br><span style="font-size:0.7rem;color:var(--muted);">GPS: ${p.lat}, ${p.lng} (${p.jarakMeter}m)</span></td>
      </tr>`
      )
      .join('');
  }

  /* -------------------- 7. REKAP KEHADIRAN A4 (PDF, DOCX, PRINT) -------------------- */
  function buildRekapSummaryRows(periode) {
    const now = new Date();
    const todayIso = SAMEJA_CORE.getIndoDateParts(now).isoDate;
    const startOfWeek = new Date(now);
    const day = now.getDay() || 7;
    startOfWeek.setDate(now.getDate() - day + 1);
    startOfWeek.setHours(0, 0, 0, 0);

    const filtered = state.presensiGuru.filter((p) => {
      if (periode === 'mingguan') return new Date(p.timestamp) >= startOfWeek;
      if (periode === 'bulanan') return p.tanggal.startsWith(todayIso.slice(0, 7));
      return p.tanggal.startsWith(todayIso.slice(0, 4));
    });

    return state.guru.map((g, idx) => {
      const logs = filtered.filter((p) => String(p.guruId) === String(g.id));
      // Datang & Pulang pada tanggal sama = 1 kehadiran; datang saja atau pulang saja = 1 kehadiran
      const hadirDates = new Set(logs.filter((l) => l.jenis === 'Hadir').map((l) => l.tanggal));
      const sakitDates = new Set(logs.filter((l) => l.jenis === 'Sakit').map((l) => l.tanggal));
      const izinDates = new Set(logs.filter((l) => l.jenis === 'Izin').map((l) => l.tanggal));
      const dinasDates = new Set(logs.filter((l) => l.jenis === 'Dinas Luar').map((l) => l.tanggal));

      const jmlHadir = hadirDates.size;
      const jmlSakit = sakitDates.size;
      const jmlIzin = izinDates.size;
      const jmlDinas = dinasDates.size;
      const total = jmlHadir + jmlSakit + jmlIzin + jmlDinas;

      return [
        idx + 1,
        `${g.nama}\nNIP. ${g.nip}`,
        jmlHadir,
        jmlSakit,
        jmlIzin,
        jmlDinas,
        total
      ];
    });
  }

  function handleExportRekap(format) {
    const periode = document.getElementById('rekap-periode').value;
    const labelMap = {
      mingguan: 'Periode Mingguan',
      bulanan: 'Periode Bulanan',
      tahunan: 'Periode Tahunan'
    };
    const headers = ['No', 'Nama Guru & NIP', 'Hadir', 'Sakit', 'Izin', 'Dinas Luar', 'Total'];
    const rows = buildRekapSummaryRows(periode);

    if (format === 'pdf') {
      SAMEJA_CORE.exportOfficialPDF({
        title: 'REKAP KEHADIRAN',
        subtitle: `${labelMap[periode]} — SMP N 1 Mekarjaya`,
        headers,
        rows,
        filename: `Rekap_Kehadiran_Guru_${periode}_SAMEJA2027.pdf`
      });
    } else if (format === 'docx') {
      SAMEJA_CORE.exportOfficialDOCX({
        title: 'REKAP KEHADIRAN',
        subtitle: `${labelMap[periode]} — SMP N 1 Mekarjaya`,
        headers,
        rows,
        filename: `Rekap_Kehadiran_Guru_${periode}_SAMEJA2027.docx`
      });
    } else if (format === 'print') {
      SAMEJA_CORE.playSound('click');
      const printArea = document.getElementById('print-area');
      const parts = SAMEJA_CORE.getIndoDateParts(new Date());
      const tglStr = parts.tanggalText.split(', ')[1];
      printArea.style.display = 'block';
      printArea.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px double #000;padding-bottom:8px;margin-bottom:14px;">
          <img src="${state.config.logoPemkab}" style="width:62px;height:74px;object-fit:contain;" />
          <div style="text-align:center;flex:1;padding:0 10px;">
            <div style="font-weight:700;font-size:12pt;">PEMERINTAH KABUPATEN PANDEGLANG</div>
            <div style="font-weight:700;font-size:11pt;">DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA</div>
            <div style="font-weight:800;font-size:16pt;letter-spacing:0.5px;">SMP N 1 MEKARJAYA</div>
            <div style="font-size:9pt;">Jln.Cibiuk KM.01 Desa Medong, Kec.Mekarjaya – Kab. Pandeglang ( 42252 )</div>
          </div>
          <img src="${state.config.logoSekolah}" style="width:62px;height:74px;object-fit:contain;" />
        </div>
        <div style="text-align:center;font-weight:800;font-size:13pt;margin-bottom:4px;">REKAP KEHADIRAN</div>
        <div style="text-align:center;font-size:10pt;margin-bottom:12px;">${labelMap[periode]}</div>
        <table style="width:100%;border-collapse:collapse;font-size:9.5pt;">
          <thead>
            <tr>${headers.map((h) => `<th style="border:1px solid #000;padding:6px;background:#e2e8f0;">${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #000;padding:6px;white-space:pre-line;">${c}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        <div style="display:flex;justify-content:space-between;margin-top:28px;font-size:10pt;">
          <div>
            <div>Mengetahui,</div>
            <div>Kepala SMP N 1 Mekarjaya</div>
            <div style="height:56px;"></div>
            <div style="font-weight:700;text-decoration:underline;">R. Dudi Romdiansah, M.Pd</div>
            <div>NIP. 19701102 199702 1 001</div>
          </div>
          <div>
            <div>Mekarjaya, ${tglStr}</div>
            <div>Wakasek Kurikulum</div>
            <div style="height:56px;"></div>
            <div style="font-weight:700;text-decoration:underline;">Yana Fakhriyana, S.Pd</div>
            <div>NIP. 19760904 200801 1 007</div>
          </div>
        </div>`;
      window.print();
      printArea.style.display = 'none';
    }
  }

  /* -------------------- 8. STATISTIK KINERJA & PENGELOMPOKAN -------------------- */
  function timeToSeconds(hhmmss) {
    const [h = 0, m = 0, s = 0] = String(hhmmss).split(':').map(Number);
    return h * 3600 + m * 60 + s;
  }

  function secondsToHHMM(sec) {
    if (!sec || sec <= 0) return '-';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function computeTeacherWeeklyStats() {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = now.getDay() || 7;
    startOfWeek.setDate(now.getDate() - day + 1);
    startOfWeek.setHours(0, 0, 0, 0);

    const LIMIT_TELAT_SEC = 7 * 3600 + 40 * 60; // 07:40:00

    return state.guru.map((g) => {
      const weekLogs = state.presensiGuru.filter(
        (p) => String(p.guruId) === String(g.id) && new Date(p.timestamp) >= startOfWeek && p.jenis === 'Hadir'
      );

      // Kelompokkan per tanggal
      const byDate = {};
      weekLogs.forEach((l) => {
        if (!byDate[l.tanggal]) byDate[l.tanggal] = [];
        byDate[l.tanggal].push(l);
      });

      const dates = Object.keys(byDate);
      const hariHadir = dates.length;
      let totalHours = 0;
      const datangSecs = [];
      const pulangSecs = [];
      let telatCount = 0;
      let totalTelatMinutes = 0;

      dates.forEach((dt) => {
        const items = byDate[dt];
        const datangItem = items.find((i) => i.subJenis === 'Datang');
        const pulangItem = items.find((i) => i.subJenis === 'Pulang');

        if (datangItem) {
          const dSec = timeToSeconds(datangItem.waktu);
          datangSecs.push(dSec);
          if (dSec > LIMIT_TELAT_SEC) {
            telatCount++;
            totalTelatMinutes += Math.round((dSec - LIMIT_TELAT_SEC) / 60);
          }
        }
        if (pulangItem) {
          pulangSecs.push(timeToSeconds(pulangItem.waktu));
        }

        if (datangItem && pulangItem) {
          const diffH = Math.max(0, (timeToSeconds(pulangItem.waktu) - timeToSeconds(datangItem.waktu)) / 3600);
          totalHours += diffH;
        } else if (datangItem || pulangItem) {
          // Datang saja atau pulang saja tetap dihitung 1 kehadiran (estimasi 7.5 jam standar)
          totalHours += 7.5;
        }
      });

      const avgDatangSec = datangSecs.length ? datangSecs.reduce((a, b) => a + b, 0) / datangSecs.length : null;
      const avgPulangSec = pulangSecs.length ? pulangSecs.reduce((a, b) => a + b, 0) / pulangSecs.length : null;
      const avgTelatMin = telatCount > 0 ? Math.round(totalTelatMinutes / telatCount) : 0;

      let badgeHtml = '<span class="badge badge-kurang"><i class="fa-solid fa-circle-exclamation"></i> Kurang Baik (&lt; 35 Jam)</span>';
      if (totalHours > 40) {
        badgeHtml = '<span class="badge badge-sangat-baik"><i class="fa-solid fa-crown"></i> Kinerja Sangat Baik (&gt; 40 Jam)</span>';
      } else if (totalHours >= 37.5) {
        badgeHtml = '<span class="badge badge-baik"><i class="fa-solid fa-medal"></i> Kinerja Baik (37,5 - 40 Jam)</span>';
      } else if (totalHours >= 35) {
        badgeHtml = '<span class="badge badge-cukup"><i class="fa-solid fa-thumbs-up"></i> Kinerja Cukup Baik (35 - 37,4 Jam)</span>';
      }

      return {
        ...g,
        hariHadir,
        totalHours: Number(totalHours.toFixed(2)),
        avgDatangSec,
        avgPulangSec,
        telatCount,
        avgTelatMin,
        badgeHtml
      };
    });
  }

  function renderStatistik() {
    const stats = computeTeacherWeeklyStats();
    const filterGuru = document.getElementById('stat-select-guru').value;
    const shownStats = filterGuru === 'ALL' ? stats : stats.filter((s) => String(s.id) === String(filterGuru));

    const avgAll = stats.length
      ? (stats.reduce((acc, s) => acc + s.totalHours, 0) / stats.length).toFixed(2)
      : '0.00';
    document.getElementById('stat-avg-hours').textContent = `${avgAll} Jam / Minggu`;

    document.getElementById('stat-individu-tbody').innerHTML = shownStats
      .map(
        (s) => `
      <tr>
        <td><strong>${s.nama}</strong><br><span style="font-size:0.74rem;color:var(--muted);">NIP. ${s.nip}</span></td>
        <td><strong>${s.hariHadir} Hari</strong></td>
        <td><strong>${s.totalHours} Jam</strong></td>
        <td>${secondsToHHMM(s.avgDatangSec)}</td>
        <td>${secondsToHHMM(s.avgPulangSec)}</td>
        <td>${s.badgeHtml}</td>
      </tr>`
      )
      .join('');

    // Diagram Chart.js
    const ctx = document.getElementById('chart-kinerja-guru').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: shownStats.map((s) => s.nama.split(',')[0]),
        datasets: [
          {
            label: 'Total Jam Kerja Mingguan',
            data: shownStats.map((s) => s.totalHours),
            backgroundColor: shownStats.map((s) =>
              s.totalHours > 40 ? '#eab308' : s.totalHours >= 37.5 ? '#10b981' : s.totalHours >= 35 ? '#0ea5e9' : '#ef4444'
            ),
            borderRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, suggestedMax: 45 } }
      }
    });

    // Pengurutan Kategori Layak Dihargai & Perlu Evaluasi
    if (stats.length === 0) return;

    const terlama = [...stats].sort((a, b) => b.totalHours - a.totalHours)[0];
    const palingPagi = [...stats].filter((s) => s.avgDatangSec !== null).sort((a, b) => a.avgDatangSec - b.avgDatangSec)[0];
    const palingSore = [...stats].filter((s) => s.avgPulangSec !== null).sort((a, b) => b.avgPulangSec - a.avgPulangSec)[0];
    const palingRajin = [...stats].sort((a, b) => b.hariHadir - a.hariHadir || b.totalHours - a.totalHours)[0];

    document.getElementById('stat-layak-dihargai').innerHTML = `
      <div class="telemetry-box"><strong>1. Durasi Terlama di Sekolah:</strong> ${terlama.nama} (${terlama.totalHours} jam)</div>
      <div class="telemetry-box"><strong>2. Paling Pagi Datang:</strong> ${palingPagi ? palingPagi.nama + ' (' + secondsToHHMM(palingPagi.avgDatangSec) + ')' : 'Belum ada data'}</div>
      <div class="telemetry-box"><strong>3. Paling Sore Pulang:</strong> ${palingSore ? palingSore.nama + ' (' + secondsToHHMM(palingSore.avgPulangSec) + ')' : 'Belum ada data'}</div>
      <div class="telemetry-box"><strong>4. Paling Rajin / Sering Hadir:</strong> ${palingRajin.nama} (${palingRajin.hariHadir} hari)</div>
    `;

    const tersebentar = [...stats].sort((a, b) => a.totalHours - b.totalHours)[0];
    const seringTelat = [...stats].sort((a, b) => b.telatCount - a.telatCount)[0];
    const datangLambat = [...stats].sort((a, b) => b.avgTelatMin - a.avgTelatMin)[0];
    const awalPulang = [...stats].filter((s) => s.avgPulangSec !== null).sort((a, b) => a.avgPulangSec - b.avgPulangSec)[0];
    const palingJarang = [...stats].sort((a, b) => a.hariHadir - b.hariHadir || a.totalHours - b.totalHours)[0];

    document.getElementById('stat-perlu-evaluasi').innerHTML = `
      <div class="telemetry-box"><strong>1. Durasi Paling Sebentar:</strong> ${tersebentar.nama} (${tersebentar.totalHours} jam)</div>
      <div class="telemetry-box"><strong>2. Paling Sering Telat (&gt;07.40):</strong> ${seringTelat.nama} (${seringTelat.telatCount}x telat)</div>
      <div class="telemetry-box"><strong>3. Rata-Rata Keterlambatan Terbesar:</strong> ${datangLambat.nama} (rata-rata telat ${datangLambat.avgTelatMin} menit)</div>
      <div class="telemetry-box"><strong>4. Paling Awal Pulang:</strong> ${awalPulang ? awalPulang.nama + ' (' + secondsToHHMM(awalPulang.avgPulangSec) + ')' : 'Belum ada data'}</div>
      <div class="telemetry-box"><strong>5. Paling Jarang ke Sekolah:</strong> ${palingJarang.nama} (${palingJarang.hariHadir} hari)</div>
    `;
  }

  /* -------------------- 9. RUANG KELAS REAL-TIME -------------------- */
  function renderRuangKelas() {
    const todayIso = SAMEJA_CORE.getIndoDateParts(new Date()).isoDate;
    const activeRooms = state.ruangKelas.filter((r) => r.terisi === 'TERISI' && r.tanggal === todayIso);
    const activeMap = {};
    activeRooms.forEach((r) => {
      activeMap[String(r.kelas).trim()] = r;
    });

    // Gabungkan daftar kelas default + kelas tambahan dari jadwal/murid
    const allKelasSet = new Set(SAMEJA_CORE.DEFAULT_KELAS_LIST);
    state.jadwalMapel.forEach((j) => j.kelas && allKelasSet.add(String(j.kelas).trim()));
    state.murid.forEach((m) => m.kelas && allKelasSet.add(String(m.kelas).trim()));

    const teachingTeacherIds = new Set(activeRooms.map((r) => String(r.guruId)));
    const guruStatusHtml = state.guru
      .map((g) => {
        const mengajar = activeRooms.find((r) => String(r.guruId) === String(g.id));
        if (mengajar) {
          return `<span class="badge badge-baik"><i class="fa-solid fa-chalkboard-user"></i> ${g.nama}: Sedang Mengajar (${mengajar.kelas} • ${mengajar.mapel})</span>`;
        }
        return `<span class="badge badge-kurang"><i class="fa-solid fa-clock"></i> ${g.nama}: Belum Masuk Kelas</span>`;
      })
      .join('');
    document.getElementById('status-guru-mengajar-list').innerHTML = guruStatusHtml;

    const grid = document.getElementById('ruang-kelas-grid');
    grid.innerHTML = Array.from(allKelasSet)
      .map((kelas) => {
        const info = activeMap[kelas];
        if (info) {
          return `
            <div class="room-card terisi">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <strong style="font-size:1.05rem;">Kelas ${kelas}</strong>
                <span class="room-badge"><i class="fa-solid fa-circle-check"></i> TERISI</span>
              </div>
              <div style="font-size:0.84rem;font-weight:800;">${info.guruNama}</div>
              <div style="font-size:0.78rem;margin-top:2px;">Mapel: <strong>${info.mapel}</strong></div>
              <div style="font-size:0.76rem;margin-top:2px;">Waktu: ${info.waktuMengajar}</div>
              <div style="margin-top:6px;font-size:0.75rem;background:rgba(16,185,129,0.18);padding:4px 8px;border-radius:8px;font-weight:700;">
                Status: ${info.statusKegiatan || 'Sedang Belajar'}
              </div>
            </div>`;
        }
        return `
          <div class="room-card kosong">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <strong style="font-size:1.05rem;">Kelas ${kelas}</strong>
              <span class="room-badge"><i class="fa-solid fa-circle-xmark"></i> KOSONG</span>
            </div>
            <div style="font-size:0.8rem;">Belum ada guru melakukan presensi mata pelajaran di kelas ini.</div>
          </div>`;
      })
      .join('');
  }

  /* -------------------- 10. EVENT BINDINGS & AKSI ADMIN -------------------- */
  function bindEvents() {
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('btn-sound-toggle').addEventListener('click', () => {
      const muted = SAMEJA_CORE.toggleMute();
      document.getElementById('btn-sound-toggle').innerHTML = muted
        ? '<i class="fa-solid fa-volume-xmark"></i>'
        : '<i class="fa-solid fa-volume-high"></i>';
    });

    document.getElementById('btn-fullscreen').addEventListener('click', () => {
      SAMEJA_CORE.playSound('click');
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    document.getElementById('sync-status-pill').addEventListener('click', async () => {
      SAMEJA_CORE.playSound('click');
      const res = await SAMEJA_CORE.syncFromServer();
      state = res.state;
      updateSyncPill(res.online);
      renderAll();
    });

    // Admin Unlock
    document.getElementById('btn-admin-unlock').addEventListener('click', () => {
      const input = document.getElementById('admin-pass-input').value.trim();
      const validCode = state.config.accessCode || 'diwantara01';
      if (input === validCode) {
        SAMEJA_CORE.playSound('unlock');
        adminUnlocked = true;
        document.getElementById('admin-lock-box').style.display = 'none';
        document.getElementById('admin-unlocked-content').style.display = 'block';
        renderAdminGuruList();
      } else {
        SAMEJA_CORE.playSound('error');
        alert('Kode akses salah! Silakan periksa kembali.');
      }
    });

    document.getElementById('btn-admin-lock-now').addEventListener('click', () => {
      SAMEJA_CORE.playSound('click');
      adminUnlocked = false;
      document.getElementById('admin-lock-box').style.display = 'block';
      document.getElementById('admin-unlocked-content').style.display = 'none';
      document.getElementById('admin-pass-input').value = '';
    });

    // Save GAS URL
    document.getElementById('btn-save-gas-url').addEventListener('click', async () => {
      SAMEJA_CORE.playSound('success');
      SAMEJA_CORE.setGasUrl(document.getElementById('cfg-gas-url').value);
      const res = await SAMEJA_CORE.syncFromServer();
      state = res.state;
      updateSyncPill(res.online);
      renderAll();
      alert('URL Google Sheets berhasil disimpan & disinkronkan!');
    });

    // Change Access Code
    document.getElementById('btn-save-access-code').addEventListener('click', async () => {
      const newCode = document.getElementById('cfg-new-access-code').value.trim();
      if (newCode.length < 4) {
        SAMEJA_CORE.playSound('error');
        return alert('Kode akses minimal 4 karakter.');
      }
      state.config.accessCode = newCode;
      SAMEJA_CORE.saveLocalState(state);
      SAMEJA_CORE.playSound('success');
      await SAMEJA_CORE.sendAction({ action: 'saveConfig', config: { accessCode: newCode } });
      alert('Kode akses berhasil diperbarui untuk semua perangkat!');
    });

    // GPS Center Configuration
    document.getElementById('btn-get-current-center').addEventListener('click', () => {
      SAMEJA_CORE.playSound('click');
      if (!currentCoords) return alert('GPS belum terkunci. Pastikan GPS HP aktif.');
      document.getElementById('cfg-center-lat').value = currentCoords.lat.toFixed(6);
      document.getElementById('cfg-center-lng').value = currentCoords.lng.toFixed(6);
    });

    document.getElementById('btn-save-center-gps').addEventListener('click', async () => {
      const lat = Number(document.getElementById('cfg-center-lat').value);
      const lng = Number(document.getElementById('cfg-center-lng').value);
      if (isNaN(lat) || isNaN(lng)) {
        SAMEJA_CORE.playSound('error');
        return alert('Format koordinat tidak valid.');
      }
      state.config.centerLat = lat.toFixed(6);
      state.config.centerLng = lng.toFixed(6);
      SAMEJA_CORE.saveLocalState(state);
      SAMEJA_CORE.playSound('success');
      await SAMEJA_CORE.sendAction({
        action: 'saveConfig',
        config: { centerLat: state.config.centerLat, centerLng: state.config.centerLng }
      });
      alert(`Lokasi pusat terkunci pada ${state.config.centerLat}, ${state.config.centerLng} dan otomatis berlaku di seluruh perangkat!`);
    });

    // Upload Logo Sekolah & Pemkab
    document.getElementById('input-logo-sekolah').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const b64 = await SAMEJA_CORE.compressFileImage(file, 220, 260);
      state.config.logoSekolah = b64;
      SAMEJA_CORE.saveLocalState(state);
      applyBrandingLogos();
      SAMEJA_CORE.playSound('success');
      await SAMEJA_CORE.sendAction({ action: 'saveConfig', config: { logoSekolah: b64 } });
      alert('Logo sekolah berhasil diperbarui & otomatis tersinkron ke seluruh perangkat dan Presensi Mapel!');
    });

    document.getElementById('input-logo-pemkab').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const b64 = await SAMEJA_CORE.compressFileImage(file, 220, 260);
      state.config.logoPemkab = b64;
      SAMEJA_CORE.saveLocalState(state);
      applyBrandingLogos();
      SAMEJA_CORE.playSound('success');
      await SAMEJA_CORE.sendAction({ action: 'saveConfig', config: { logoPemkab: b64 } });
      alert('Logo Pemerintah Kabupaten berhasil diperbarui & otomatis tersinkron!');
    });

    // Form Tambah / Edit Guru
    document.getElementById('form-guru').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-guru-id').value || `G-${Date.now()}`;
      const nama = document.getElementById('input-guru-nama').value.trim();
      const nip = document.getElementById('input-guru-nip').value.trim();
      const idx = state.guru.findIndex((g) => String(g.id) === String(id));
      const guruObj = { id, nama, nip };
      if (idx >= 0) state.guru[idx] = guruObj;
      else state.guru.push(guruObj);

      SAMEJA_CORE.saveLocalState(state);
      SAMEJA_CORE.playSound('success');
      document.getElementById('edit-guru-id').value = '';
      document.getElementById('input-guru-nama').value = '';
      document.getElementById('input-guru-nip').value = '';
      renderAdminGuruList();
      renderGuruDropdown();
      await SAMEJA_CORE.sendAction({ action: 'saveGuru', guru: guruObj });
    });

    // Dropdown Guru NIP Display
    document.getElementById('select-guru-presensi').addEventListener('change', (e) => {
      SAMEJA_CORE.playSound('click');
      const g = state.guru.find((item) => String(item.id) === String(e.target.value));
      document.getElementById('selected-guru-nip-display').textContent = g ? `NIP. ${g.nip}` : '';
    });

    // Pilihan Keterangan Kehadiran
    document.querySelectorAll('#keterangan-pills .pill-option').forEach((pill) => {
      pill.addEventListener('click', () => {
        SAMEJA_CORE.playSound('click');
        document.querySelectorAll('#keterangan-pills .pill-option').forEach((p) => p.classList.remove('selected'));
        pill.classList.add('selected');
        selectedKeterangan = pill.dataset.val;

        document.getElementById('box-opsi-hadir').style.display = selectedKeterangan === 'Hadir' ? 'block' : 'none';
        document.getElementById('box-opsi-sakit').style.display = selectedKeterangan === 'Sakit' ? 'block' : 'none';
        document.getElementById('box-opsi-izin').style.display = selectedKeterangan === 'Izin' ? 'block' : 'none';
        document.getElementById('box-opsi-dinas').style.display = selectedKeterangan === 'Dinas Luar' ? 'block' : 'none';

        const radiusMax = Number(state.config.radiusMeters || 500);
        document.getElementById('radius-warning-box').style.display =
          selectedKeterangan === 'Hadir' && currentDistance !== null && currentDistance > radiusMax ? 'block' : 'none';
      });
    });

    document.querySelectorAll('#subhadir-pills .pill-option').forEach((pill) => {
      pill.addEventListener('click', () => {
        SAMEJA_CORE.playSound('click');
        document.querySelectorAll('#subhadir-pills .pill-option').forEach((p) => p.classList.remove('selected'));
        pill.classList.add('selected');
        selectedSubHadir = pill.dataset.val;
      });
    });

    // Kamera Actions
    document.getElementById('btn-switch-camera').addEventListener('click', () => {
      SAMEJA_CORE.playSound('click');
      facingMode = facingMode === 'user' ? 'environment' : 'user';
      startLiveCamera();
    });
    document.getElementById('btn-take-photo').addEventListener('click', capturePortraitPhoto);
    document.getElementById('btn-retake-photo').addEventListener('click', () => {
      SAMEJA_CORE.playSound('click');
      capturedPhotoBase64 = '';
      document.getElementById('btn-take-photo').style.display = 'inline-flex';
      document.getElementById('btn-retake-photo').style.display = 'none';
      startLiveCamera();
    });

    document.getElementById('btn-submit-presensi').addEventListener('click', handleSubmitPresensi);

    // Galeri & Daftar Filter Listeners
    ['galeri-search', 'galeri-filter-kategori', 'galeri-sort'].forEach((id) => {
      document.getElementById(id).addEventListener('input', renderGaleri);
    });
    ['daftar-search', 'daftar-group-time', 'daftar-filter-cat', 'daftar-sort'].forEach((id) => {
      document.getElementById(id).addEventListener('input', renderDaftarKehadiran);
    });
    document.getElementById('stat-select-guru').addEventListener('change', () => {
      SAMEJA_CORE.playSound('click');
      renderStatistik();
    });

    // Export Buttons
    document.getElementById('btn-print-rekap').addEventListener('click', () => handleExportRekap('print'));
    document.getElementById('btn-download-pdf').addEventListener('click', () => handleExportRekap('pdf'));
    document.getElementById('btn-download-docx').addEventListener('click', () => handleExportRekap('docx'));
  }

  function renderAll() {
    renderGuruDropdown();
    renderGaleri();
    renderDaftarKehadiran();
    renderStatistik();
    renderRuangKelas();
  }

  return {
    init,
    editGuru: (id) => {
      SAMEJA_CORE.playSound('click');
      const g = state.guru.find((x) => String(x.id) === String(id));
      if (!g) return;
      document.getElementById('edit-guru-id').value = g.id;
      document.getElementById('input-guru-nama').value = g.nama;
      document.getElementById('input-guru-nip').value = g.nip;
    },
    deleteGuru: async (id) => {
      if (!confirm('Hapus data guru ini?')) return;
      SAMEJA_CORE.playSound('click');
      state.guru = state.guru.filter((x) => String(x.id) !== String(id));
      SAMEJA_CORE.saveLocalState(state);
      renderAdminGuruList();
      renderGuruDropdown();
      await SAMEJA_CORE.sendAction({ action: 'deleteGuru', id });
    },
    resetProgram: async (scope) => {
      const label = scope === 'all' ? 'SELURUH DATA PROGRAM' : `BAGIAN (${scope.toUpperCase()})`;
      if (!confirm(`PERINGATAN! Anda yakin ingin mereset ${label}?`)) return;
      const verif = prompt('Masukkan kode akses Admin untuk konfirmasi reset:');
      if (verif !== (state.config.accessCode || 'diwantara01')) {
        SAMEJA_CORE.playSound('error');
        return alert('Kode akses salah! Reset dibatalkan.');
      }
      SAMEJA_CORE.playSound('success');
      if (scope === 'presensi_guru' || scope === 'all') state.presensiGuru = [];
      if (scope === 'presensi_mapel' || scope === 'all') {
        state.presensiMapel = [];
        state.ruangKelas = [];
      }
      if (scope === 'jadwal_murid' || scope === 'all') {
        state.jadwalMapel = [];
        state.murid = [];
      }
      if (scope === 'all') {
        localStorage.removeItem('sameja_terpusat_state_v1');
        state = SAMEJA_CORE.loadLocalState();
      } else {
        SAMEJA_CORE.saveLocalState(state);
      }
      renderAll();
      if (adminUnlocked) renderAdminGuruList();
      await SAMEJA_CORE.sendAction({ action: 'resetData', scope });
      alert('Reset berhasil dijalankan.');
    }
  };
})();

document.addEventListener('DOMContentLoaded', GURU_APP.init);