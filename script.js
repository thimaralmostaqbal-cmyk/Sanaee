/* ============================================================
   script.js — منصة صنايعي  (النسخة المُحسَّنة)
   ============================================================
   الهيكل:
   ── CONFIG          : الثوابت والإعدادات
   ── StorageService  : طبقة بيانات LocalStorage
   ── Validator       : التحقق من صحة النماذج
   ── UI              : تحديثات الواجهة (render, toast, modal)
   ── App             : التهيئة وربط الأحداث
   ============================================================ */

'use strict'; // ★ تحسين: الوضع الصارم يكشف الأخطاء الصامتة مبكراً

/* ============================================================
   CONFIG — كل الثوابت في مكان واحد
   ============================================================ */
const CONFIG = Object.freeze({
  STORAGE_KEY:    'sanaee_workers_v1',
  MAX_IMAGE_SIZE: 2 * 1024 * 1024,           // ★ تحسين: حد أقصى 2 ميجا للصورة
  MAX_IMAGE_PX:   400,                        // ★ تحسين: ضغط الصورة لـ 400px
  TOAST_DURATION: 3000,
  SPECIALTIES: ['نجار', 'سباك', 'كهربائي', 'ميكانيكي'],  // ★ مصدر واحد للتخصصات
  SPECIALTY_ICONS: {
    'نجار':     '🪵',
    'سباك':     '🔧',
    'كهربائي':  '⚡',
    'ميكانيكي': '🔩'
  }
});

/* ============================================================
   بيانات افتراضية — أول تشغيل فقط
   ============================================================ */
const DEFAULT_WORKERS = [
  { id: 'w1', name: 'محمد السيد',    specialty: 'كهربائي',  area: 'المنصورة', phone: '01012345678', rating: 5, image: null },
  { id: 'w2', name: 'أحمد إبراهيم', specialty: 'سباك',     area: 'الزقازيق', phone: '01098765432', rating: 4, image: null },
  { id: 'w3', name: 'حسن علي',      specialty: 'نجار',     area: 'المنصورة', phone: '01155556666', rating: 4, image: null },
  { id: 'w4', name: 'خالد عبد الله',specialty: 'ميكانيكي', area: 'طنطا',     phone: '01234567890', rating: 5, image: null },
  { id: 'w5', name: 'عمرو حسين',    specialty: 'نجار',     area: 'الزقازيق', phone: '01123456789', rating: 3, image: null },
  { id: 'w6', name: 'ياسر ممدوح',   specialty: 'كهربائي',  area: 'طنطا',     phone: '01056789012', rating: 5, image: null }
];


/* ============================================================
   StorageService — طبقة البيانات
   ============================================================ */
const StorageService = {

  /** تحميل البيانات من LocalStorage */
  load() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) {
        this.save(DEFAULT_WORKERS);
        return structuredClone(DEFAULT_WORKERS); // ★ تحسين: clone لتجنب mutation
      }
      const parsed = JSON.parse(raw);
      // ★ تحسين: تحقق أن المحتوى مصفوفة وليس بيانات فاسدة
      return Array.isArray(parsed) ? parsed : DEFAULT_WORKERS;
    } catch {
      console.warn('بيانات LocalStorage تالفة، جاري إعادة التعيين.');
      this.save(DEFAULT_WORKERS);
      return structuredClone(DEFAULT_WORKERS);
    }
  },

  /**
   * حفظ البيانات في LocalStorage مع معالجة QuotaExceededError
   * ★ تحسين: لم يكن هناك أي معالجة لخطأ امتلاء الذاكرة
   * @returns {boolean} — true عند النجاح
   */
  save(workers) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(workers));
      return true;
    } catch (err) {
      if (err.name === 'QuotaExceededError') {
        UI.showToast('⚠️ ذاكرة المتصفح ممتلئة! احذف بعض الصور أو بيانات قديمة.', 'error');
      }
      return false;
    }
  }
};


/* ============================================================
   ImageService — معالجة الصور
   ============================================================ */
const ImageService = {

  /**
   * ★ تحسين كبير: ضغط الصورة وتصغيرها قبل الحفظ
   * الصورة الأصلية قد تكون 3MB → بعد الضغط < 50KB
   * @param {File} file
   * @returns {Promise<string|null>} base64 data URL
   */
  compress(file) {
    return new Promise((resolve, reject) => {

      // ★ أمان: تحقق من نوع الملف
      if (!file.type.startsWith('image/')) {
        reject(new Error('الملف ليس صورة'));
        return;
      }

      // ★ أمان: تحقق من الحجم قبل القراءة
      if (file.size > CONFIG.MAX_IMAGE_SIZE) {
        reject(new Error(`حجم الصورة ${(file.size / 1024 / 1024).toFixed(1)} ميجا، الحد الأقصى 2 ميجا`));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('فشل قراءة الصورة'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('ملف الصورة تالف'));
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxPx   = CONFIG.MAX_IMAGE_PX;
          const ratio   = Math.min(maxPx / img.width, maxPx / img.height, 1);
          canvas.width  = Math.round(img.width  * ratio);
          canvas.height = Math.round(img.height * ratio);

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // جودة 0.8 توازن بين الوضوح وحجم الملف
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  /**
   * ★ أمان: التحقق من أن src الصورة data URL وليس JavaScript URI
   * @param {string} src
   * @returns {boolean}
   */
  isSafeImageSrc(src) {
    if (!src) return false;
    return src.startsWith('data:image/');
  }
};


/* ============================================================
   Validator — التحقق من صحة البيانات
   ============================================================ */
const Validator = {

  // ★ تحسين: Regex صحيح — [0-2,5] الأصلي يتضمن الفاصلة بالخطأ
  // الإصلاح: [0125] فقط الأرقام الصحيحة
  PHONE_REGEX: /^(01[0125][0-9]{8}|[0-9]{7,15})$/,

  /** ★ تحسين DRY: قواعد الحقول مُعرَّفة كبيانات بدل تكرار كود if/else */
  RULES: [
    {
      field:   'workerName',
      errorId: 'nameError',
      test:    (v) => v.trim().length >= 3,
      message: 'الاسم يجب أن يكون 3 أحرف على الأقل'
    },
    {
      field:   'workerSpecialty',
      errorId: 'specialtyError',
      test:    (v) => v !== '',
      message: 'الرجاء اختيار التخصص'
    },
    {
      field:   'workerArea',
      errorId: 'areaError',
      test:    (v) => v.trim().length >= 2,
      message: 'الرجاء إدخال المنطقة (حرفان على الأقل)'
    },
    {
      field:   'workerPhone',
      errorId: 'phoneError',
      test:    (v) => Validator.PHONE_REGEX.test(v.replace(/[\s\-]/g, '')),
      message: 'رقم الهاتف غير صحيح (مثال: 01012345678)'
    }
  ],

  /**
   * يُشغّل جميع القواعد ويُرجع true إذا كل شيء صحيح
   * @returns {boolean}
   */
  validateForm() {
    let valid = true;
    this.RULES.forEach(({ field, errorId, test, message }) => {
      const el  = document.getElementById(field);
      const err = document.getElementById(errorId);
      const grp = el.closest('.form-group');

      // مسح حالة الخطأ القديمة
      err.textContent = '';
      grp.classList.remove('has-error');

      if (!test(el.value)) {
        err.textContent = message;
        grp.classList.add('has-error'); // ★ تحسين: تلوين الحقل بالأحمر
        if (valid) el.focus();          // ★ تحسين: التركيز على أول حقل خاطئ
        valid = false;
      }
    });
    return valid;
  },

  /** مسح جميع حالات الخطأ */
  clearErrors() {
    this.RULES.forEach(({ errorId, field }) => {
      document.getElementById(errorId).textContent = '';
      document.getElementById(field).closest('.form-group').classList.remove('has-error');
    });
  }
};


/* ============================================================
   UI — كل ما يخص تحديث الواجهة
   ============================================================ */
const UI = {

  /** ★ تحسين: cache مراجع DOM مرة واحدة — تجنب البحث المتكرر */
  els: {
    workersGrid:     document.getElementById('workersGrid'),
    filterSpecialty: document.getElementById('filterSpecialty'),
    filterArea:      document.getElementById('filterArea'),
    resetFilters:    document.getElementById('resetFilters'),
    noResults:       document.getElementById('noResults'),
    formModal:       document.getElementById('formModal'),
    openFormBtn:     document.getElementById('openFormBtn'),
    closeFormBtn:    document.getElementById('closeFormBtn'),
    cancelFormBtn:   document.getElementById('cancelFormBtn'),
    addWorkerForm:   document.getElementById('addWorkerForm'),
    starPicker:      document.getElementById('starPicker'),
    workerImageInput:document.getElementById('workerImage'),
    imagePreview:    document.getElementById('imagePreview'),
    toast:           document.getElementById('toast'),
    submitBtn:       document.getElementById('submitBtn'),
    totalWorkers:    document.getElementById('totalWorkers'),
    totalAreas:      document.getElementById('totalAreas'),
    totalSpecialties:document.getElementById('totalSpecialties'),
    currentYear:     document.getElementById('currentYear')
  },

  /* ── إنشاء كرت صنايعي ── */
  /**
   * ★ تحسين الأداء: DocumentFragment بدل innerHTML في loop
   * innerHTML يُعيد parse الـ HTML في كل مرة — بطيء
   * createElement أسرع وأكثر أماناً
   * @param {Object} worker
   * @returns {HTMLElement}
   */
  createCard(worker) {
    const card = document.createElement('article');
    card.className = 'worker-card';
    // ★ تحسين: data-specialty بدل class يحتوي نصاً عربياً
    card.dataset.specialty = worker.specialty;
    card.dataset.id        = worker.id;

    /* ── avatar ── */
    const avatar = document.createElement('div');
    avatar.className = 'worker-avatar';
    if (worker.image && ImageService.isSafeImageSrc(worker.image)) {
      // ★ أمان: isSafeImageSrc يمنع src="javascript:..."
      const img = document.createElement('img');
      img.src   = worker.image;
      img.alt   = worker.name;
      img.loading = 'lazy'; // ★ تحسين: تحميل الصور عند الحاجة فقط
      avatar.appendChild(img);
    } else {
      avatar.textContent = CONFIG.SPECIALTY_ICONS[worker.specialty] || '👷';
    }

    /* ── معلومات ── */
    const info = document.createElement('div');
    info.className = 'worker-info';

    const name = document.createElement('p');
    name.className   = 'worker-name';
    name.textContent = worker.name; // ★ أمان: textContent بدل innerHTML يمنع XSS

    const meta = document.createElement('div');
    meta.className = 'worker-meta';

    const badgeSpec = document.createElement('span');
    badgeSpec.className   = 'badge badge-specialty';
    badgeSpec.textContent = `${CONFIG.SPECIALTY_ICONS[worker.specialty] || ''} ${worker.specialty}`;

    const badgeArea = document.createElement('span');
    badgeArea.className   = 'badge badge-area';
    badgeArea.textContent = worker.area; // ★ أمان: textContent

    meta.appendChild(badgeSpec);
    meta.appendChild(badgeArea);

    const starsEl = document.createElement('div');
    starsEl.className   = 'stars';
    starsEl.setAttribute('aria-label', `التقييم: ${worker.rating} من 5 نجوم`);
    starsEl.innerHTML   = this.buildStarsHTML(worker.rating); // آمن: نبني نجوماً فقط

    info.appendChild(name);
    info.appendChild(meta);
    info.appendChild(starsEl);

    /* ── inner ── */
    const inner = document.createElement('div');
    inner.className = 'card-inner';
    inner.appendChild(avatar);
    inner.appendChild(info);

    /* ── actions ── */
    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const callBtn = document.createElement('a');
    callBtn.className = 'btn-call';
    // ★ أمان: sanitizePhone يضمن أن الرقم أرقام فقط → لا XSS في tel:
    const safePhone   = this.sanitizePhone(worker.phone);
    callBtn.href      = `tel:${safePhone}`;
    callBtn.setAttribute('aria-label', `اتصل بـ ${worker.name} على ${safePhone}`);
    callBtn.innerHTML = `<i class="fa-solid fa-phone" aria-hidden="true"></i> اتصل: ${safePhone}`;

    const deleteBtn = document.createElement('button');
    deleteBtn.className       = 'btn-delete';
    deleteBtn.type            = 'button';
    deleteBtn.dataset.id      = worker.id;
    deleteBtn.setAttribute('aria-label', `حذف ${worker.name}`);
    deleteBtn.innerHTML       = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';

    actions.appendChild(callBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(inner);
    card.appendChild(actions);
    return card;
  },

  /** بناء HTML النجوم (آمن — نص محدود) */
  buildStarsHTML(rating) {
    const clamped = Math.min(5, Math.max(0, Math.round(rating)));
    return Array.from({ length: 5 }, (_, i) =>
      i < clamped
        ? '<span class="star-filled" aria-hidden="true">★</span>'
        : '<span class="star-empty"  aria-hidden="true">☆</span>'
    ).join('');
  },

  /**
   * ★ أمان: تنظيف رقم الهاتف — إبقاء الأرقام فقط
   * يمنع tel:javascript: أو tel:+<script>
   */
  sanitizePhone(phone) {
    return String(phone).replace(/[^\d+]/g, '').slice(0, 15);
  },

  /* ── عرض الكروت ── */
  /**
   * ★ تحسين الأداء: DocumentFragment → إضافة واحدة للـ DOM بدل loop
   * @param {Array} workers
   */
  renderWorkers(workers) {
    const grid = this.els.workersGrid;
    // إزالة الكروت القديمة
    grid.replaceChildren();

    if (workers.length === 0) {
      this.els.noResults.classList.remove('hidden');
      return;
    }
    this.els.noResults.classList.add('hidden');

    // ★ تحسين: fragment يجمع الكروت خارج الـ DOM ثم يضيفها مرة واحدة
    const fragment = document.createDocumentFragment();
    workers.forEach(w => fragment.appendChild(this.createCard(w)));
    grid.appendChild(fragment);
  },

  /* ── فلتر المناطق ── */
  updateAreaFilter(workers) {
    const areas        = [...new Set(workers.map(w => w.area))].sort();
    const currentValue = this.els.filterArea.value;

    const fragment = document.createDocumentFragment();
    const defaultOpt = document.createElement('option');
    defaultOpt.value       = 'all';
    defaultOpt.textContent = 'جميع المناطق';
    fragment.appendChild(defaultOpt);

    areas.forEach(area => {
      const opt = document.createElement('option');
      opt.value       = area;
      opt.textContent = area;
      if (area === currentValue) opt.selected = true;
      fragment.appendChild(opt);
    });

    this.els.filterArea.replaceChildren(fragment);
  },

  /* ── إحصائيات ── */
  updateStats(workers) {
    const uniqueAreas = new Set(workers.map(w => w.area)).size;
    // ★ تحسين: cache المراجع في this.els بدل document.getElementById كل مرة
    this.els.totalWorkers.textContent    = workers.length;
    this.els.totalAreas.textContent      = uniqueAreas;
    this.els.totalSpecialties.textContent= CONFIG.SPECIALTIES.length;
  },

  /* ── Toast ── */
  _toastTimer: null,
  /**
   * ★ تحسين: نستخدم CSS classes .show/.hide بدل إضافة/إزالة .hidden
   * لأن animation لا تُعاد إلا إذا أُزيل العنصر من DOM أو أُعيد تعيين animation
   * @param {string} message
   * @param {'success'|'error'|''} type
   */
  showToast(message, type = '') {
    clearTimeout(this._toastTimer);
    const el = this.els.toast;

    // إيقاف أي animation قديمة أولاً
    el.classList.remove('show', 'hide', 'success', 'error', 'hidden');
    void el.offsetWidth; // ★ reflow خفيف لإعادة تشغيل animation

    el.textContent = message;
    if (type) el.classList.add(type);
    el.classList.add('show');

    this._toastTimer = setTimeout(() => {
      el.classList.replace('show', 'hide');
      setTimeout(() => el.classList.add('hidden'), 260);
    }, CONFIG.TOAST_DURATION);
  },

  /* ── Modal ── */
  openModal() {
    this.els.formModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // ★ تحسين: نقل التركيز إلى أول حقل في النموذج (accessibility)
    requestAnimationFrame(() => {
      const first = this.els.addWorkerForm.querySelector('input, select');
      if (first) first.focus();
    });
  },

  closeModal() {
    const overlay = this.els.formModal;
    const box     = overlay.querySelector('.modal-box');

    // ★ تحسين: انيميشن إغلاق قبل الإخفاء
    overlay.classList.add('closing');
    box.addEventListener('animationend', () => {
      overlay.classList.add('hidden');
      overlay.classList.remove('closing');
      document.body.style.overflow = '';
      // ★ تحسين: إعادة التركيز لزر الفتح بعد الإغلاق (accessibility)
      this.els.openFormBtn.focus();
    }, { once: true });
  },

  /* ── نموذج النجوم ── */
  _selectedRating: 5,

  initStarPicker() {
    const stars = this.els.starPicker.querySelectorAll('.star');
    stars.forEach(star => {
      star.addEventListener('click', () => {
        this._selectedRating = parseInt(star.dataset.value, 10);
        document.getElementById('workerRating').value = this._selectedRating;
        this.updateStarPicker(this._selectedRating);
      });
      // ★ تحسين: دعم لوحة المفاتيح على النجوم
      star.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          star.click();
        }
      });
    });
    this.updateStarPicker(5);
  },

  updateStarPicker(value) {
    const stars = this.els.starPicker.querySelectorAll('.star');
    stars.forEach(s => {
      const active = parseInt(s.dataset.value, 10) <= value;
      s.classList.toggle('active', active);
      s.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  },

  resetStarPicker() {
    this._selectedRating = 5;
    this.updateStarPicker(5);
  },

  resetForm() {
    this.els.addWorkerForm.reset();
    this.resetStarPicker();
    this.els.imagePreview.classList.add('hidden');
    this.els.imagePreview.src = '';
    Validator.clearErrors();
    this.els.submitBtn.disabled = false;
    this.els.submitBtn.textContent = '';
    this.els.submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> حفظ الصنايعي';
  }
};


/* ============================================================
   App — التهيئة وربط الأحداث
   ============================================================ */
const App = {

  workers: [],

  init() {
    this.workers = StorageService.load();

    // تعيين سنة Footer
    UI.els.currentYear.textContent = new Date().getFullYear();

    // تهيئة نجوم النموذج
    UI.initStarPicker();

    // ربط الأحداث
    this.bindEvents();

    // أول عرض
    this.refresh();
  },

  /* ★ تحسين الأداء: Event Delegation للحذف بدل ربط listener على كل كرت */
  bindEvents() {
    const { els } = UI;

    // ── فلاتر ──
    els.filterSpecialty.addEventListener('change', () => this.applyFilters());
    els.filterArea.addEventListener('change',      () => this.applyFilters());
    els.resetFilters.addEventListener('click', () => {
      els.filterSpecialty.value = 'all';
      els.filterArea.value      = 'all';
      this.applyFilters();
    });

    // ── modal ──
    els.openFormBtn.addEventListener('click',   () => UI.openModal());
    els.closeFormBtn.addEventListener('click',  () => UI.closeModal());
    els.cancelFormBtn.addEventListener('click', () => { UI.resetForm(); UI.closeModal(); });
    els.formModal.addEventListener('click', (e) => {
      if (e.target === els.formModal) { UI.resetForm(); UI.closeModal(); }
    });

    // ★ تحسين: Escape يغلق المودال
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !els.formModal.classList.contains('hidden')) {
        UI.resetForm();
        UI.closeModal();
      }
    });

    // ── نموذج الإضافة ──
    els.addWorkerForm.addEventListener('submit', (e) => this.handleSubmit(e));

    // ── معاينة الصورة ──
    els.workerImageInput.addEventListener('change', (e) => this.handleImageChange(e));

    // ★ تحسين: Event Delegation — listener واحد على الـ grid بدل N listener
    els.workersGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-delete');
      if (btn) this.handleDelete(btn.dataset.id);
    });
  },

  /* ── تطبيق الفلاتر ── */
  applyFilters() {
    const specialty = UI.els.filterSpecialty.value;
    const area      = UI.els.filterArea.value;

    const filtered = this.workers.filter(w => {
      return (specialty === 'all' || w.specialty === specialty)
          && (area      === 'all' || w.area      === area);
    });

    UI.renderWorkers(filtered);
  },

  /* ── تحديث كامل ── */
  refresh() {
    UI.updateAreaFilter(this.workers);
    UI.updateStats(this.workers);
    this.applyFilters();
  },

  /* ── حذف صنايعي ── */
  handleDelete(id) {
    // ★ تحسين UX: بدل confirm المُقفل، نستخدم custom confirm لاحقاً
    if (!window.confirm('هل تريد حذف هذا الصنايعي؟')) return;

    this.workers = this.workers.filter(w => w.id !== id);
    StorageService.save(this.workers);
    this.refresh();
    UI.showToast('تم الحذف بنجاح 🗑️', 'error');
  },

  /* ── إضافة صنايعي جديد ── */
  async handleSubmit(e) {
    e.preventDefault();
    if (!Validator.validateForm()) return;

    // ★ تحسين UX: تعطيل الزر أثناء المعالجة لمنع الضغط المتكرر
    UI.els.submitBtn.disabled    = true;
    UI.els.submitBtn.textContent = '⏳ جاري الحفظ...';

    const name      = document.getElementById('workerName').value.trim();
    const specialty = document.getElementById('workerSpecialty').value;
    const area      = document.getElementById('workerArea').value.trim();
    // ★ تحسين: تنظيف الرقم من المسافات والشرطات قبل الحفظ
    const phone     = document.getElementById('workerPhone').value.replace(/[\s\-]/g, '');
    const rating    = UI._selectedRating;
    const imgFile   = UI.els.workerImageInput.files[0];

    let imageData = null;
    if (imgFile) {
      try {
        // ★ تحسين: async/await أوضح من callbacks المتداخلة
        imageData = await ImageService.compress(imgFile);
      } catch (err) {
        UI.showToast(`⚠️ ${err.message}`, 'error');
        UI.els.submitBtn.disabled    = false;
        UI.els.submitBtn.innerHTML   = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> حفظ الصنايعي';
        return;
      }
    }

    const newWorker = {
      id:        'w' + Date.now(),
      name,
      specialty,
      area,
      phone,
      rating,
      image:     imageData
    };

    this.workers.unshift(newWorker);
    const saved = StorageService.save(this.workers);

    if (saved) {
      UI.closeModal();
      setTimeout(() => UI.resetForm(), 300); // بعد انيميشن الإغلاق
      this.refresh();
      UI.showToast(`✅ تم إضافة "${name}" بنجاح`, 'success');
    } else {
      // فشل الحفظ (QuotaExceeded) — أُلغي من المصفوفة
      this.workers.shift();
      UI.els.submitBtn.disabled  = false;
      UI.els.submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> حفظ الصنايعي';
    }
  },

  /* ── معاينة الصورة ── */
  async handleImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const dataUrl = await ImageService.compress(file);
      UI.els.imagePreview.src = dataUrl;
      UI.els.imagePreview.classList.remove('hidden');
    } catch (err) {
      UI.showToast(`⚠️ ${err.message}`, 'error');
      UI.els.workerImageInput.value = '';
      UI.els.imagePreview.classList.add('hidden');
    }
  }
};


/* ============================================================
   تشغيل التطبيق
   ============================================================ */
// ★ تحسين: DOMContentLoaded يضمن جاهزية الـ DOM قبل الـ script
// (مفيد لو نُقل الـ script لرأس الصفحة مستقبلاً)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
