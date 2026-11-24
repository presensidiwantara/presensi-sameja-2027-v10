/**
 * ============================================================================
 * LOGIKA APLIKASI 2: PRESENSI MATA PELAJARAN SMP N 1 MEKARJAYA
 * ============================================================================
 */

const MAPEL_APP = (() => {
  let state = SAMEJA_CORE.loadLocalState();
  let activeGuru = null;
  let currentRowsState = []; // [{ muridId, nis, nama, status: 'H'|'S'|'I'|'A', nilai: '' }]

  async function init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // Splash screen 2 detik
    setTimeout(() => {
      const splash = document.getElementById('splash-screen');
      if (splash) splash.classList.add('hidden');
    }, 2000);

    applyBrandingLogos();
    populateStaticOptions();
    bindEvents();
    updateAutoDate();
    renderAll();

    const res = await SAMEJA_CORE.syncFromServer();
    state = res.state;
    updateSyncPill(res.online);
    applyBrandingLogos();
    renderAll();
  }

  function updateSyncPill(isOnline) {
    const pill = document.getElementById('sync-status-pill');
    const txt = document.getElementById('sync-status-text');
    const outbox = SAMEJA_CORE.getOutbox().length;
    if (isOnline) {
      pill.className = 'sync-pill online';
      txt.textContent = outbox > 0 ? `Sync (${outbox})` : 'Online';
    } else {
      pill.className = 'sync-pill offline';
      txt.textContent = outbox > 0 ? `Lokal (${outbox})` : 'Offline';
    }
  }

  function applyBrandingLogos() {
    const logoSekolah = state.config.logoSekolah || './assets/logo-sekolah.png';
    ['splash-logo-img', 'header-logo-sekolah'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.src = logoSekolah;
    });
  }

  function populateStaticOptions() {
    const mapelSel = document.getElementById('rg-select-mapel');
    mapelSel.innerHTML = SAMEJA_CORE.DEFAULT_MAPEL_LIST.map(
      (m) => `<option value="${m}">${m}</option>`
    ).join('');

    const dl = document.getElementById('kelas-datalist');
    dl.innerHTML = SAMEJA_CORE.DEFAULT_KELAS_LIST.map((k) => `<option value="${k}"></option>`).join('');
  }

  function updateAutoDate() {
    const parts = SAMEJA_CORE.getIndoDateParts(new Date());
    document.getElementById('rm-auto-date').textContent = parts.fullText;
  }

  function switchTab(tabName) {
    SAMEJA_CORE.playSound('click');
    document.querySelectorAll('.nav-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.section-panel').forEach((s) => s.classList.toggle('active', s.id === `panel-${tabName}`));
    if (tabName === 'statistikmurid') renderStatistikMurid();
  }

  function renderGuruLoginDropdown() {
    const sel = document.getElementById('rg-login-guru');
    sel.innerHTML = '<option value="">-- Pilih Nama Guru --</option>' +
      state.guru.map((g) => `<option value="${g.id}">${g.nama} (NIP. ${g.nip})</option>`).join('');
  }

  function renderLembarPresensi() {
    const listWrap = document.getElementById('rg-lembar-list');
    const rmSel = document.getElementById('rm-select-lembar');
    const prevVal = rmSel.value;

    rmSel.innerHTML = '<option value="">-- Pilih Kelas & Mata Pelajaran --</option>' +
      state.jadwalMapel
        .map((j) => `<option value="${j.id}">Kelas ${j.kelas} • ${j.mapel} (${j.guruNama})</option>`)
        .join('');
    rmSel.value = prevVal;

    if (!listWrap) return;
    if (state.jadwalMapel.length === 0) {
      listWrap.innerHTML = '<p style="color:var(--muted);font-size:0.82rem;">Belum ada lembar presensi dibuat.</p>';
    } else {
      listWrap.innerHTML = state.jadwalMapel
        .map(
          (j) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:11px;background:#f8fafc;">
          <div>
            <div style="font-weight:800;font-size:0.88rem;color:var(--primary);">Kelas ${j.kelas} — ${j.mapel}</div>
            <div style="font-size:0.75rem;color:var(--muted);">Guru: ${j.guruNama} • Waktu: ${j.jamKe || '-'}</div>
          </div>
          <button class="btn btn-danger" style="padding:6px 10px;font-size:0.75rem;" onclick="MAPEL_APP.deleteLembar('${j.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>`
        )
        .join('');
    }

    const smKelas = document.getElementById('sm-filter-kelas');
    const classes = Array.from(new Set(state.murid.map((m) => m.kelas)));
    smKelas.innerHTML = '<option value="ALL">Semua Kelas</option>' +
      classes.map((c) => `<option value="${c}">Kelas ${c}</option>`).join('');

    const sumEl = document.getElementById('rg-murid-summary');
    if (sumEl) sumEl.textContent = `Total Data Murid Terdaftar: ${state.murid.length} siswa dari ${classes.length} kelas.`;
  }

  function loadMuridTableForLembar(lembarId) {
    const tbody = document.getElementById('rm-murid-tbody');
    const jadwal = state.jadwalMapel.find((j) => String(j.id) === String(lembarId));
    if (!jadwal) {
      currentRowsState = [];
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:18px;">Pilih Kelas & Mata Pelajaran terlebih dahulu.</td></tr>';
      return;
    }

    const siswaKelas = state.murid.filter(
      (m) => String(m.kelas).trim().toUpperCase() === String(jadwal.kelas).trim().toUpperCase()
    );
    if (siswaKelas.length === 0) {
      currentRowsState = [];
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--danger);padding:18px;">Belum ada data murid untuk Kelas ${jadwal.kelas}. Silakan impor CSV di menu Ruang Guru.</td></tr>`;
      return;
    }

    currentRowsState = siswaKelas.map((m) => ({
      muridId: m.id,
      nis: m.nis,
      nama: m.nama,
      status: 'H',
      nilai: ''
    }));

    renderMuridRows();
  }

  function renderMuridRows() {
    const tbody = document.getElementById('rm-murid-tbody');
    tbody.innerHTML = currentRowsState
      .map(
        (r, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${r.nama}</strong><br><span style="font-size:0.72rem;color:var(--muted);">NIS: ${r.nis || '-'}</span></td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${['H', 'S', 'I', 'A']
              .map(
                (st) => `
              <button type="button" onclick="MAPEL_APP.setMuridStatus(${idx}, '${st}')"
                style="padding:5px 9px;border-radius:8px;font-weight:800;font-size:0.76rem;cursor:pointer;border:1px solid #cbd5e1;
                background:${r.status === st ? (st === 'H' ? '#10b981' : st === 'A' ? '#ef4444' : '#f59e0b') : '#fff'};
                color:${r.status === st ? '#fff' : '#0f172a'};">
                ${st}
              </button>`
              )
              .join('')}
          </div>
        </td>
        <td>
          <input type="number" min="0" max="100" value="${r.nilai}" placeholder="0-100"
            onchange="MAPEL_APP.setMuridNilai(${idx}, this.value)"
            class="form-control" style="padding:6px 8px;font-size:0.82rem;text-align:center;" />
        </td>
      </tr>`
      )
      .join('');
  }

  async function handleSavePresensiMapel() {
    const lembarId = document.getElementById('rm-select-lembar').value;
    const jadwal = state.jadwalMapel.find((j) => String(j.id) === String(lembarId));
    if (!jadwal) {
      SAMEJA_CORE.playSound('error');
      return alert('Silakan pilih Kelas & Mata Pelajaran terlebih dahulu.');
    }
    const materi = document.getElementById('rm-input-materi').value.trim();
    if (!materi) {
      SAMEJA_CORE.playSound('error');
      return alert('Materi bahasan pertemuan wajib diisi!');
    }
    if (currentRowsState.length === 0) {
      SAMEJA_CORE.playSound('error');
      return alert('Daftar murid kosong.');
    }

    const statusKegiatan = document.getElementById('rm-status-kegiatan').value;
    const now = new Date();
    const parts = SAMEJA_CORE.getIndoDateParts(now);

    const record = {
      id: `PM-${Date.now()}`,
      tanggal: parts.isoDate,
      waktu: parts.jam,
      timestamp: now.toISOString(),
      guruId: jadwal.guruId,
      guruNama: jadwal.guruNama,
      guruNip: jadwal.guruNip,
      mapel: jadwal.mapel,
      kelas: jadwal.kelas,
      jamMengajar: jadwal.jamKe || parts.jam,
      statusKelas: statusKegiatan,
      materi,
      detailMuridJson: JSON.stringify(currentRowsState)
    };

    state.presensiMapel.unshift(record);

    // Perbarui langsung status Ruang Kelas di state lokal agar terbaca di Presensi Guru
    const rkIdx = state.ruangKelas.findIndex((r) => String(r.kelas).trim() === String(jadwal.kelas).trim());
    const rkObj = {
      kelas: jadwal.kelas,
      terisi: 'TERISI',
      guruId: jadwal.guruId,
      guruNama: jadwal.guruNama,
      mapel: jadwal.mapel,
      waktuMengajar: jadwal.jamKe || parts.jam,
      statusKegiatan,
      materi,
      tanggal: parts.isoDate,
      updatedAt: now.toISOString()
    };
    if (rkIdx >= 0) state.ruangKelas[rkIdx] = rkObj;
    else state.ruangKelas.push(rkObj);

    SAMEJA_CORE.saveLocalState(state);
    SAMEJA_CORE.playSound('success');
    document.getElementById('rm-input-materi').value = '';

    alert(`Presensi Mata Pelajaran (${jadwal.mapel} - Kelas ${jadwal.kelas}) berhasil disimpan & status Ruang Kelas otomatis diperbarui!`);

    const syncRes = await SAMEJA_CORE.sendAction({ action: 'addPresensiMapel', item: record });
    state = syncRes.state;
    updateSyncPill(syncRes.synced);
  }

  function handleExportMurid(format) {
    const lembarId = document.getElementById('rm-select-lembar').value;
    const jadwal = state.jadwalMapel.find((j) => String(j.id) === String(lembarId));
    if (!jadwal) {
      SAMEJA_CORE.playSound('error');
      return alert('Pilih Kelas & Mata Pelajaran yang akan diunduh rekapnya.');
    }

    const filterType = document.getElementById('rm-rekap-filter').value;
    const now = new Date();
    const ym = SAMEJA_CORE.getIndoDateParts(now).isoDate.slice(0, 7);
    const yr = ym.slice(0, 4);

    const sessions = state.presensiMapel.filter((pm) => {
      if (String(pm.kelas).trim() !== String(jadwal.kelas).trim() || pm.mapel !== jadwal.mapel) return false;
      const monthNum = Number(String(pm.tanggal).split('-')[1] || 0);
      if (filterType === 'bulanan') return String(pm.tanggal).startsWith(ym);
      if (filterType === 'ganjil') return String(pm.tanggal).startsWith(yr) && monthNum >= 7 && monthNum <= 12;
      if (filterType === 'genap') return String(pm.tanggal).startsWith(yr) && monthNum >= 1 && monthNum <= 6;
      return true;
    });

    const siswaKelas = state.murid.filter((m) => String(m.kelas).trim() === String(jadwal.kelas).trim());
    const headers = ['No', 'NIS', 'Nama Murid', 'H', 'S', 'I', 'A', 'Rata-Rata Nilai'];
    const rows = siswaKelas.map((m, idx) => {
      let h = 0, s = 0, i = 0, a = 0, nilaiSum = 0, nilaiCount = 0;
      sessions.forEach((ses) => {
        let details = [];
        try { details = JSON.parse(ses.detailMuridJson || '[]'); } catch (_) {}
        const found = details.find((d) => String(d.muridId) === String(m.id) || d.nama === m.nama);
        if (found) {
          if (found.status === 'H') h++;
          else if (found.status === 'S') s++;
          else if (found.status === 'I') i++;
          else if (found.status === 'A') a++;
          if (found.nilai !== '' && !isNaN(Number(found.nilai))) {
            nilaiSum += Number(found.nilai);
            nilaiCount++;
          }
        }
      });
      const avgNilai = nilaiCount > 0 ? (nilaiSum / nilaiCount).toFixed(1) : '-';
      return [idx + 1, m.nis || '-', m.nama, h, s, i, a, avgNilai];
    });

    const filterLabel = {
      bulanan: 'Rekap Bulanan',
      ganjil: 'Semester Ganjil (Juli - Desember)',
      genap: 'Semester Genap (Januari - Juni)',
      tahunan: 'Tahun Ajaran'
    }[filterType];

    const subtitle = `Kelas ${jadwal.kelas} • Mata Pelajaran: ${jadwal.mapel} (${filterLabel})`;
    if (format === 'pdf') {
      SAMEJA_CORE.exportOfficialPDF({
        title: 'REKAP KEHADIRAN',
        subtitle,
        headers,
        rows,
        filename: `Rekap_Murid_${jadwal.kelas}_${jadwal.mapel}.pdf`
      });
    } else {
      SAMEJA_CORE.exportOfficialDOCX({
        title: 'REKAP KEHADIRAN',
        subtitle,
        headers,
        rows,
        filename: `Rekap_Murid_${jadwal.kelas}_${jadwal.mapel}.docx`
      });
    }
  }

  function renderStatistikMurid() {
    const filterKelas = document.getElementById('sm-filter-kelas').value;
    const students = filterKelas === 'ALL'
      ? state.murid
      : state.murid.filter((m) => String(m.kelas).trim() === String(filterKelas).trim());

    const computed = students.map((m) => {
      let hadir = 0, absen = 0, nilaiSum = 0, nilaiCnt = 0;
      state.presensiMapel.forEach((ses) => {
        if (String(ses.kelas).trim() !== String(m.kelas).trim()) return;
        let details = [];
        try { details = JSON.parse(ses.detailMuridJson || '[]'); } catch (_) {}
        const found = details.find((d) => String(d.muridId) === String(m.id) || d.nama === m.nama);
        if (found) {
          if (found.status === 'H') hadir++;
          else absen++;
          if (found.nilai !== '' && !isNaN(Number(found.nilai))) {
            nilaiSum += Number(found.nilai);
            nilaiCnt++;
          }
        }
      });
      return {
        ...m,
        hadir,
        absen,
        avgNilai: nilaiCnt > 0 ? Number((nilaiSum / nilaiCnt).toFixed(1)) : 0,
        hasNilai: nilaiCnt > 0
      };
    });

    if (computed.length === 0) return;

    const palingRajin = [...computed].sort((a, b) => b.hadir - a.hadir || a.absen - b.absen)[0];
    const nilaiTertinggi = [...computed].sort((a, b) => b.avgNilai - a.avgNilai)[0];

    const banyakAbsen = [...computed].sort((a, b) => b.absen - a.absen)[0];
    const nilaiTerendah = [...computed].filter((c) => c.hasNilai).sort((a, b) => a.avgNilai - b.avgNilai)[0] || computed[0];

    document.getElementById('sm-layak-dihargai').innerHTML = `
      <div class="telemetry-box"><strong>1. Murid Paling Rajin Hadir:</strong> ${palingRajin.nama} (Kelas ${palingRajin.kelas} • ${palingRajin.hadir}x Hadir)</div>
      <div class="telemetry-box"><strong>2. Nilai Rata-Rata Tertinggi:</strong> ${nilaiTertinggi.nama} (Kelas ${nilaiTertinggi.kelas} • Rata-rata ${nilaiTertinggi.avgNilai})</div>
    `;

    document.getElementById('sm-butuh-evaluasi').innerHTML = `
      <div class="telemetry-box"><strong>1. Ketidakhadiran Terbanyak:</strong> ${banyakAbsen.nama} (Kelas ${banyakAbsen.kelas} • ${banyakAbsen.absen}x Tidak Hadir)</div>
      <div class="telemetry-box"><strong>2. Nilai Rata-Rata Paling Rendah:</strong> ${nilaiTerendah.nama} (Kelas ${nilaiTerendah.kelas} • Rata-rata ${nilaiTerendah.avgNilai})</div>
    `;
  }

  function bindEvents() {
    document.querySelectorAll('.nav-tab').forEach((b) => {
      b.addEventListener('click', () => switchTab(b.dataset.tab));
    });

    document.getElementById('btn-sound-toggle').addEventListener('click', () => {
      const muted = SAMEJA_CORE.toggleMute();
      document.getElementById('btn-sound-toggle').innerHTML = muted
        ? '<i class="fa-solid fa-volume-xmark"></i>'
        : '<i class="fa-solid fa-volume-high"></i>';
    });

    document.getElementById('btn-fullscreen').addEventListener('click', () => {
      SAMEJA_CORE.playSound('click');
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    });

    // Login Ruang Guru
    document.getElementById('btn-rg-login').addEventListener('click', () => {
      const gId = document.getElementById('rg-login-guru').value;
      const code = document.getElementById('rg-login-code').value.trim();
      const validCode = state.config.accessCode || 'diwantara01';
      if (!gId) {
        SAMEJA_CORE.playSound('error');
        return alert('Silakan pilih Nama Guru.');
      }
      if (code !== validCode) {
        SAMEJA_CORE.playSound('error');
        return alert('Kode akses salah!');
      }
      activeGuru = state.guru.find((g) => String(g.id) === String(gId));
      SAMEJA_CORE.playSound('unlock');
      document.getElementById('rg-lock-box').style.display = 'none';
      document.getElementById('rg-unlocked-content').style.display = 'block';
      document.getElementById('rg-active-teacher-banner').innerHTML =
        `<i class="fa-solid fa-user-check"></i> Aktif: <strong>${activeGuru.nama}</strong> (NIP. ${activeGuru.nip})`;
      renderLembarPresensi();
    });

    document.getElementById('btn-rg-logout').addEventListener('click', () => {
      SAMEJA_CORE.playSound('click');
      activeGuru = null;
      document.getElementById('rg-lock-box').style.display = 'block';
      document.getElementById('rg-unlocked-content').style.display = 'none';
      document.getElementById('rg-login-code').value = '';
    });

    // Buat Lembar Presensi
    document.getElementById('form-lembar-presensi').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activeGuru) return;
      const mapel = document.getElementById('rg-select-mapel').value;
      const kelas = document.getElementById('rg-input-kelas').value.trim().toUpperCase();
      const jamKe = document.getElementById('rg-input-waktu').value.trim();
      const jadwalObj = {
        id: `JM-${Date.now()}`,
        guruId: activeGuru.id,
        guruNama: activeGuru.nama,
        guruNip: activeGuru.nip,
        mapel,
        kelas,
        jamKe
      };
      state.jadwalMapel.push(jadwalObj);
      SAMEJA_CORE.saveLocalState(state);
      SAMEJA_CORE.playSound('success');
      document.getElementById('rg-input-kelas').value = '';
      document.getElementById('rg-input-waktu').value = '';
      renderLembarPresensi();
      await SAMEJA_CORE.sendAction({ action: 'saveJadwalMapel', jadwal: jadwalObj });
    });

    // Download Template CSV
    document.getElementById('btn-download-csv-template').addEventListener('click', () => {
      SAMEJA_CORE.playSound('click');
      const csvContent =
        'NIS,Nama_Murid,Kelas,Jenis_Kelamin\n' +
        '262707001,Ahmad Fauzi,VII-A,L\n' +
        '262707002,Siti Nurhaliza,VII-A,P\n' +
        '262707003,Rizky Pratama,VII-B,L\n';
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'template_murid_sameja2027.csv';
      link.click();
    });

    // Import CSV Murid
    document.getElementById('input-import-csv').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const lines = ev.target.result.split(/\r?\n/).filter((l) => l.trim() !== '');
        const imported = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(/[,;]/).map((c) => c.trim());
          if (cols.length >= 3 && cols[1]) {
            imported.push({
              id: `M-${Date.now()}-${i}`,
              nis: cols[0] || '',
              nama: cols[1],
              kelas: cols[2].toUpperCase(),
              jk: (cols[3] || 'L').toUpperCase()
            });
          }
        }
        if (imported.length === 0) {
          SAMEJA_CORE.playSound('error');
          return alert('Format CSV tidak terbaca. Gunakan template CSV yang disediakan.');
        }
        state.murid.push(...imported);
        SAMEJA_CORE.saveLocalState(state);
        SAMEJA_CORE.playSound('success');
        renderLembarPresensi();
        alert(`Berhasil mengimpor ${imported.length} data murid!`);
        await SAMEJA_CORE.sendAction({ action: 'importMurid', muridList: imported });
      };
      reader.readAsText(file);
    });

    // Ruang Murid Actions
    document.getElementById('rm-select-lembar').addEventListener('change', (e) => {
      SAMEJA_CORE.playSound('click');
      loadMuridTableForLembar(e.target.value);
    });

    document.getElementById('btn-set-all-hadir').addEventListener('click', () => {
      SAMEJA_CORE.playSound('click');
      currentRowsState.forEach((r) => (r.status = 'H'));
      renderMuridRows();
    });

    document.getElementById('btn-simpan-presensi-mapel').addEventListener('click', handleSavePresensiMapel);
    document.getElementById('btn-rm-pdf').addEventListener('click', () => handleExportMurid('pdf'));
    document.getElementById('btn-rm-docx').addEventListener('click', () => handleExportMurid('docx'));
    document.getElementById('sm-filter-kelas').addEventListener('change', () => {
      SAMEJA_CORE.playSound('click');
      renderStatistikMurid();
    });
  }

  function renderAll() {
    renderGuruLoginDropdown();
    renderLembarPresensi();
    renderStatistikMurid();
  }

  return {
    init,
    setMuridStatus: (idx, st) => {
      SAMEJA_CORE.playSound('click');
      if (currentRowsState[idx]) {
        currentRowsState[idx].status = st;
        renderMuridRows();
      }
    },
    setMuridNilai: (idx, val) => {
      if (currentRowsState[idx]) currentRowsState[idx].nilai = val;
    },
    deleteLembar: async (id) => {
      if (!confirm('Hapus lembar presensi ini?')) return;
      SAMEJA_CORE.playSound('click');
      state.jadwalMapel = state.jadwalMapel.filter((j) => String(j.id) !== String(id));
      SAMEJA_CORE.saveLocalState(state);
      renderLembarPresensi();
      await SAMEJA_CORE.sendAction({ action: 'deleteJadwalMapel', id });
    }
  };
})();

document.addEventListener('DOMContentLoaded', MAPEL_APP.init);