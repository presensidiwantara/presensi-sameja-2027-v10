/**
 * ============================================================================
 * SHARED CORE ENGINE - PRESENSI SAMEJA 2027
 * SMP N 1 MEKARJAYA
 * ============================================================================
 */

const SAMEJA_CORE = (() => {
  // GANTI DENGAN URL WEB APP GOOGLE APPS SCRIPT ANDA (BERAKHIRAN /exec)
  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbz_BvA1bS6h__sghXhaTpt-dadf1dj5qoQqkoaj5jgE2c4M5eOBlm8z_neSGQx_cOCR3A/exec';

  const STORAGE_KEYS = {
    GAS_URL: 'sameja_gas_url',
    STATE: 'sameja_terpusat_state_v1',
    OUTBOX: 'sameja_offline_outbox_v1',
    SOUND_MUTED: 'sameja_sound_muted'
  };

  const DEFAULT_KELAS_LIST = [
    'VII-A', 'VII-B', 'VII-C', 'VII-D', 'VII-E',
    'VIII-A', 'VIII-B', 'VIII-C', 'VIII-D', 'VIII-E',
    'IX-A', 'IX-B', 'IX-C', 'IX-D', 'IX-E'
  ];

  const DEFAULT_MAPEL_LIST = [
    'Pendidikan Agama dan Budi Pekerti',
    'Pendidikan Pancasila',
    'Bahasa Indonesia',
    'Matematika',
    'Ilmu Pengetahuan Alam (IPA)',
    'Ilmu Pengetahuan Sosial (IPS)',
    'Bahasa Inggris',
    'Pendidikan Jasmani, Olahraga & Kesehatan',
    'Informatika',
    'Seni Budaya',
    'Prakarya',
    'Bahasa Sunda',
    'Bimbingan Konseling'
  ];

  const DEFAULT_STATE = {
    config: {
      accessCode: 'diwantara01',
      logoSekolah: './assets/logo-sekolah.png',
      logoPemkab: './assets/logo-pemkab.png',
      centerLat: '-6.364850',
      centerLng: '105.982140',
      radiusMeters: '500'
    },
    guru: [
      { id: 'G001', nama: 'R. Dudi Romdiansah, M.Pd', nip: '19701102 199702 1 001' },
      { id: 'G002', nama: 'Yana Fakhriyana, S.Pd', nip: '19760904 200801 1 007' }
    ],
    presensiGuru: [],
    jadwalMapel: [],
    murid: [
      { id: 'M001', nis: '262707001', nama: 'Ahmad Fauzi', kelas: 'VII-A', jk: 'L' },
      { id: 'M002', nis: '262707002', nama: 'Siti Nurhaliza', kelas: 'VII-A', jk: 'P' },
      { id: 'M003', nis: '262707003', nama: 'Deden Kurniawan', kelas: 'VII-A', jk: 'L' }
    ],
    presensiMapel: [],
    ruangKelas: []
  };

  /* -------------------- 1. WEB AUDIO SOUND EFFECTS -------------------- */
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playSound(type = 'click') {
    if (localStorage.getItem(STORAGE_KEYS.SOUND_MUTED) === '1') return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.exponentialRampToValueAtTime(840, now + 0.06);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      } else if (type === 'shutter') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(950, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.12);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.start(now);
        osc.stop(now + 0.13);
      } else if (type === 'success') {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, now + idx * 0.07);
          g.gain.setValueAtTime(0.11, now + idx * 0.07);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.22);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(now + idx * 0.07);
          o.stop(now + idx * 0.07 + 0.23);
        });
      } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(210, now);
        osc.frequency.linearRampToValueAtTime(145, now + 0.28);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.31);
      } else if (type === 'unlock') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.21);
      }
    } catch (_) {}
  }

  function isMuted() {
    return localStorage.getItem(STORAGE_KEYS.SOUND_MUTED) === '1';
  }

  function toggleMute() {
    const next = !isMuted();
    localStorage.setItem(STORAGE_KEYS.SOUND_MUTED, next ? '1' : '0');
    if (!next) playSound('click');
    return next;
  }

  /* -------------------- 2. STATE & GOOGLE SHEETS SYNC -------------------- */
  function getGasUrl() {
    return localStorage.getItem(STORAGE_KEYS.GAS_URL) || DEFAULT_GAS_URL;
  }

  function setGasUrl(url) {
    localStorage.setItem(STORAGE_KEYS.GAS_URL, url.trim());
  }

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.STATE);
      if (!raw) {
        saveLocalState(DEFAULT_STATE);
        return JSON.parse(JSON.stringify(DEFAULT_STATE));
      }
      const parsed = JSON.parse(raw);
      return {
        config: { ...DEFAULT_STATE.config, ...(parsed.config || {}) },
        guru: Array.isArray(parsed.guru) ? parsed.guru : DEFAULT_STATE.guru,
        presensiGuru: Array.isArray(parsed.presensiGuru) ? parsed.presensiGuru : [],
        jadwalMapel: Array.isArray(parsed.jadwalMapel) ? parsed.jadwalMapel : [],
        murid: Array.isArray(parsed.murid) ? parsed.murid : DEFAULT_STATE.murid,
        presensiMapel: Array.isArray(parsed.presensiMapel) ? parsed.presensiMapel : [],
        ruangKelas: Array.isArray(parsed.ruangKelas) ? parsed.ruangKelas : []
      };
    } catch (_) {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  function saveLocalState(state) {
    try {
      localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(state));
    } catch (e) {
      console.warn('Penyimpanan lokal penuh:', e);
    }
  }

  function getOutbox() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.OUTBOX) || '[]');
    } catch (_) {
      return [];
    }
  }

  function pushOutbox(payload) {
    const box = getOutbox();
    box.push({ ...payload, queuedAt: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEYS.OUTBOX, JSON.stringify(box));
  }

  async function flushOutbox() {
    const url = getGasUrl();
    if (!url || url.includes('PASTE_YOUR_SCRIPT_ID_HERE') || !navigator.onLine) return false;
    const box = getOutbox();
    if (box.length === 0) return true;

    const remaining = [];
    for (const item of box) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(item)
        });
        const data = await res.json();
        if (data && data.status === 'ok') {
          mergeRemoteState(data);
        } else {
          remaining.push(item);
        }
      } catch (_) {
        remaining.push(item);
      }
    }
    localStorage.setItem(STORAGE_KEYS.OUTBOX, JSON.stringify(remaining));
    return remaining.length === 0;
  }

  function mergeRemoteState(remote) {
    if (!remote || remote.status !== 'ok') return loadLocalState();
    const local = loadLocalState();
    const merged = {
      config: {
        ...local.config,
        ...(remote.config || {})
      },
      guru: remote.guru && remote.guru.length > 0 ? remote.guru : local.guru,
      presensiGuru: Array.isArray(remote.presensiGuru) ? remote.presensiGuru : local.presensiGuru,
      jadwalMapel: Array.isArray(remote.jadwalMapel) ? remote.jadwalMapel : local.jadwalMapel,
      murid: remote.murid && remote.murid.length > 0 ? remote.murid : local.murid,
      presensiMapel: Array.isArray(remote.presensiMapel) ? remote.presensiMapel : local.presensiMapel,
      ruangKelas: Array.isArray(remote.ruangKelas) ? remote.ruangKelas : local.ruangKelas
    };
    if (!merged.config.logoSekolah) merged.config.logoSekolah = './assets/logo-sekolah.png';
    if (!merged.config.logoPemkab) merged.config.logoPemkab = './assets/logo-pemkab.png';
    saveLocalState(merged);
    return merged;
  }

  async function syncFromServer() {
    const url = getGasUrl();
    if (!url || url.includes('PASTE_YOUR_SCRIPT_ID_HERE') || !navigator.onLine) {
      return { online: false, state: loadLocalState() };
    }
    try {
      await flushOutbox();
      const res = await fetch(`${url}?t=${Date.now()}`);
      const data = await res.json();
      if (data && data.status === 'ok') {
        const state = mergeRemoteState(data);
        return { online: true, state };
      }
    } catch (_) {}
    return { online: false, state: loadLocalState() };
  }

  async function sendAction(payload) {
    const url = getGasUrl();
    if (!url || url.includes('PASTE_YOUR_SCRIPT_ID_HERE') || !navigator.onLine) {
      pushOutbox(payload);
      return { synced: false, state: loadLocalState() };
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.status === 'ok') {
        const state = mergeRemoteState(data);
        return { synced: true, state };
      }
    } catch (_) {}
    pushOutbox(payload);
    return { synced: false, state: loadLocalState() };
  }

  /* -------------------- 3. GPS HAVERSINE & FORMAT WAKTU -------------------- */
  function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(Number(lat2) - Number(lat1));
    const dLon = toRad(Number(lon2) - Number(lon1));
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(Number(lat1))) *
        Math.cos(toRad(Number(lat2))) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  function formatCoord(lat, lng) {
    return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }

  function getIndoDateParts(dateObj = new Date()) {
    const hariList = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const bulanList = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const pad = (n) => String(n).padStart(2, '0');
    const hari = hariList[dateObj.getDay()];
    const tgl = dateObj.getDate();
    const bulan = bulanList[dateObj.getMonth()];
    const tahun = dateObj.getFullYear();
    const jam = `${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;
    const isoDate = `${tahun}-${pad(dateObj.getMonth() + 1)}-${pad(tgl)}`;
    return {
      hari,
      tanggalText: `${hari}, ${tgl} ${bulan} ${tahun}`,
      jam,
      isoDate,
      fullText: `${hari}, ${tgl} ${bulan} ${tahun} • Pukul ${jam} WIB`
    };
  }

  /* -------------------- 4. KONVERSI GAMBAR KE DATA URL -------------------- */
  async function imageToDataUrl(src, maxW = 220, maxH = 260) {
    return new Promise((resolve) => {
      if (!src) return resolve('');
      if (src.startsWith('data:image')) return resolve(src);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve('');
      img.src = src;
    });
  }

  function compressFileImage(file, maxW = 220, maxH = 260) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* -------------------- 5. EXPORT PDF & DOCX A4 RESMI -------------------- */
  async function exportOfficialPDF({ title, subtitle, headers, rows, filename }) {
    playSound('click');
    const state = loadLocalState();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const logoPemkabB64 = await imageToDataUrl(state.config.logoPemkab, 180, 210);
    const logoSekolahB64 = await imageToDataUrl(state.config.logoSekolah, 180, 210);

    // KOP SURAT RESMI
    if (logoPemkabB64) doc.addImage(logoPemkabB64, 'PNG', 16, 11, 18, 22);
    if (logoSekolahB64) doc.addImage(logoSekolahB64, 'PNG', 176, 11, 18, 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('PEMERINTAH KABUPATEN PANDEGLANG', 105, 15, { align: 'center' });
    doc.setFontSize(10.5);
    doc.text('DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA', 105, 20, { align: 'center' });
    doc.setFontSize(15);
    doc.text('SMP N 1 MEKARJAYA', 105, 26.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Jln.Cibiuk KM.01 Desa Medong, Kec.Mekarjaya – Kab. Pandeglang ( 42252 )', 105, 31.5, { align: 'center' });

    doc.setLineWidth(0.8);
    doc.line(15, 35, 195, 35);
    doc.setLineWidth(0.25);
    doc.line(15, 36.2, 195, 36.2);

    // JUDUL REKAP
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(title.toUpperCase(), 105, 43, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(subtitle, 105, 48, { align: 'center' });

    doc.autoTable({
      startY: 52,
      head: [headers],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.3, textColor: [15, 23, 42] },
      headStyles: { fillColor: [11, 34, 57], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      margin: { left: 15, right: 15 }
    });

    let finalY = doc.lastAutoTable.finalY + 12;
    if (finalY > 245) {
      doc.addPage();
      finalY = 20;
    }

    const parts = getIndoDateParts(new Date());
    const tglStr = parts.tanggalText.split(', ')[1];

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Mengetahui,', 22, finalY);
    doc.text('Kepala SMP N 1 Mekarjaya', 22, finalY + 5);
    doc.setFont('helvetica', 'bold');
    doc.text('R. Dudi Romdiansah, M.Pd', 22, finalY + 25);
    doc.setFont('helvetica', 'normal');
    doc.text('NIP. 19701102 199702 1 001', 22, finalY + 30);

    doc.text(`Mekarjaya, ${tglStr}`, 132, finalY);
    doc.text('Wakasek Kurikulum', 132, finalY + 5);
    doc.setFont('helvetica', 'bold');
    doc.text('Yana Fakhriyana, S.Pd', 132, finalY + 25);
    doc.setFont('helvetica', 'normal');
    doc.text('NIP. 19760904 200801 1 007', 132, finalY + 30);

    doc.save(filename);
    playSound('success');
  }

  async function exportOfficialDOCX({ title, subtitle, headers, rows, filename }) {
    playSound('click');
    const state = loadLocalState();
    const {
      Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
      WidthType, AlignmentType, BorderStyle, ImageRun
    } = window.docx;

    const dataUrlToUint8 = async (src) => {
      const b64 = await imageToDataUrl(src, 160, 190);
      if (!b64) return null;
      const raw = atob(b64.split(',')[1]);
      const arr = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return arr;
    };

    const pemkabBytes = await dataUrlToUint8(state.config.logoPemkab);
    const sekolahBytes = await dataUrlToUint8(state.config.logoSekolah);
    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

    const kopTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: noBorder, left: noBorder, right: noBorder,
        bottom: { style: BorderStyle.DOUBLE, size: 18, color: '000000' }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 15, type: WidthType.PERCENTAGE },
              borders: noBorders,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: pemkabBytes
                    ? [new ImageRun({ data: pemkabBytes, transformation: { width: 54, height: 65 } })]
                    : []
                })
              ]
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              borders: noBorders,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: 'PEMERINTAH KABUPATEN PANDEGLANG', bold: true, size: 22 })]
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: 'DINAS PENDIDIKAN, KEPEMUDAAN DAN OLAHRAGA', bold: true, size: 20 })]
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: 'SMP N 1 MEKARJAYA', bold: true, size: 30 })]
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: 'Jln.Cibiuk KM.01 Desa Medong, Kec.Mekarjaya – Kab. Pandeglang ( 42252 )', size: 17 })]
                })
              ]
            }),
            new TableCell({
              width: { size: 15, type: WidthType.PERCENTAGE },
              borders: noBorders,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: sekolahBytes
                    ? [new ImageRun({ data: sekolahBytes, transformation: { width: 54, height: 65 } })]
                    : []
                })
              ]
            })
          ]
        })
      ]
    });

    const dataRows = [
      new TableRow({
        tableHeader: true,
        children: headers.map(
          (h) =>
            new TableCell({
              shading: { fill: '0B2239' },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: String(h), bold: true, color: 'FFFFFF', size: 18 })]
                })
              ]
            })
        )
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: r.map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 18 })] })]
                })
            )
          })
      )
    ];

    const parts = getIndoDateParts(new Date());
    const tglStr = parts.tanggalText.split(', ')[1];

    const ttdTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: noBorders,
              children: [
                new Paragraph({ children: [new TextRun({ text: 'Mengetahui,', size: 20 })] }),
                new Paragraph({ children: [new TextRun({ text: 'Kepala SMP N 1 Mekarjaya', size: 20 })] }),
                new Paragraph({ text: '' }),
                new Paragraph({ text: '' }),
                new Paragraph({ text: '' }),
                new Paragraph({ children: [new TextRun({ text: 'R. Dudi Romdiansah, M.Pd', bold: true, underline: {}, size: 20 })] }),
                new Paragraph({ children: [new TextRun({ text: 'NIP. 19701102 199702 1 001', size: 19 })] })
              ]
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: noBorders,
              children: [
                new Paragraph({ children: [new TextRun({ text: `Mekarjaya, ${tglStr}`, size: 20 })] }),
                new Paragraph({ children: [new TextRun({ text: 'Wakasek Kurikulum', size: 20 })] }),
                new Paragraph({ text: '' }),
                new Paragraph({ text: '' }),
                new Paragraph({ text: '' }),
                new Paragraph({ children: [new TextRun({ text: 'Yana Fakhriyana, S.Pd', bold: true, underline: {}, size: 20 })] }),
                new Paragraph({ children: [new TextRun({ text: 'NIP. 19760904 200801 1 007', size: 19 })] })
              ]
            })
          ]
        })
      ]
    });

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 }, // A4 dalam twips
              margin: { top: 850, right: 850, bottom: 850, left: 850 }
            }
          },
          children: [
            kopTable,
            new Paragraph({ text: '' }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 24 })]
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: subtitle, size: 20 })]
            }),
            new Paragraph({ text: '' }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: dataRows
            }),
            new Paragraph({ text: '' }),
            new Paragraph({ text: '' }),
            ttdTable
          ]
        }
      ]
    });

    const blob = await Packer.toBlob(doc);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    playSound('success');
  }

  return {
    DEFAULT_KELAS_LIST,
    DEFAULT_MAPEL_LIST,
    playSound,
    isMuted,
    toggleMute,
    getGasUrl,
    setGasUrl,
    loadLocalState,
    saveLocalState,
    getOutbox,
    syncFromServer,
    sendAction,
    calculateDistanceMeters,
    formatCoord,
    getIndoDateParts,
    compressFileImage,
    exportOfficialPDF,
    exportOfficialDOCX
  };
})();