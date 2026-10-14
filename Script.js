/* ===== Menu mobile & Navigasi Aktif ===== */
const menuToggle = document.getElementById('menu-toggle');
const navLinks = document.getElementById('nav-links');
const menuIcon = menuToggle.querySelector('i');
const navItems = navLinks.querySelectorAll('a');

function setMenu(isOpen) {
    navLinks.classList.toggle('active', isOpen);
    menuToggle.setAttribute('aria-expanded', isOpen);
    menuToggle.setAttribute('aria-label', isOpen ? 'Tutup menu' : 'Buka menu');
    menuIcon.className = isOpen ? 'ri-close-line' : 'ri-menu-line';
}

menuToggle.addEventListener('click', () => {
    setMenu(!navLinks.classList.contains('active'));
});

// Efek klik menu: pindah kelas active ke menu yang dituju
navItems.forEach(link => {
    link.addEventListener('click', (e) => {
        navItems.forEach(item => item.classList.remove('active'));
        link.classList.add('active');
        setMenu(false);
    });
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.glass-nav')) setMenu(false);
});

window.addEventListener('resize', () => {
    if (window.innerWidth > 900) setMenu(false);
});

/* ===== Pindah Menu Otomatis Saat Halaman Di-scroll ===== */
const sections = document.querySelectorAll('section[id]');

window.addEventListener('scroll', () => {
    let scrollPos = window.scrollY + 250;

    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.offsetHeight;
        const sectionId = section.getAttribute('id');

        if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
            navItems.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${sectionId}`) {
                    link.classList.add('active');
                }
            });
        }
    });
});

/* ===== Efek Navbar Scroll (Blur & Solid Transparan Halus) ===== */
const glassNav = document.querySelector('.glass-nav');
let isScrolling = false;

function handleNavScroll() {
    if (window.scrollY > 30) {
        glassNav.classList.add('scrolled');
    } else {
        glassNav.classList.remove('scrolled');
    }
    isScrolling = false;
}

window.addEventListener('scroll', () => {
    if (!isScrolling) {
        window.requestAnimationFrame(handleNavScroll);
        isScrolling = true;
    }
});

handleNavScroll();

/* ===== Progress bar scroll ===== */
const progressBar = document.getElementById('progress-bar');

function updateProgress() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const percent = max > 0 ? (doc.scrollTop / max) * 100 : 0;
    progressBar.style.width = percent + '%';
}

window.addEventListener('scroll', updateProgress);
window.addEventListener('resize', updateProgress);
updateProgress();

/* ===== Fitur "Lihat Selengkapnya" di About ===== */
const readMoreBtn = document.getElementById('read-more-btn');
const aboutMoreText = document.querySelector('.about-more-text');

if (readMoreBtn) {
    readMoreBtn.addEventListener('click', () => {
        const isShow = aboutMoreText.classList.toggle('show');
        readMoreBtn.classList.toggle('active', isShow);
        
        const spanText = readMoreBtn.querySelector('span');
        if (isShow) {
            spanText.textContent = 'Sembunyikan';
        } else {
            spanText.textContent = 'Lihat Selengkapnya';
        }
    });
}

/* ===== Ganti Tema & Simpan ke LocalStorage ===== */
const themeToggle = document.getElementById('theme-toggle');
const themePanel = document.getElementById('theme-panel');
const themeName = document.getElementById('theme-name');
const swatches = document.querySelectorAll('.swatch');

const THEME_NAMES = {
    green: 'Neon Hijau',
    blue: 'Samudra Biru',
    purple: 'Ungu Galaksi',
    orange: 'Sunset Oranye',
    pink: 'Pink Neon',
    light: 'Mode Terang',
    custom: 'Kustom'
};

const customColor = document.getElementById('custom-color');
const baseBtns = document.querySelectorAll('.base-btn');
const rootStyle = document.documentElement.style;
const CUSTOM_VARS = ['--accent-rgb', '--on-accent', '--bg', '--panel-solid'];

let customState = { color: '#00d4ff', base: 'dark' };

function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return [h, s, l];
}

function hslToRgb(h, s, l) {
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function applyCustomVars() {
    const isLight = customState.base === 'light';
    const [r, g, b] = hexToRgb(customState.color);
    let [h, s, l] = rgbToHsl(r, g, b);

    l = isLight ? Math.min(l, 0.42) : Math.max(l, 0.55);
    const [ar, ag, ab] = hslToRgb(h, s, l);
    const lum = (0.2126 * ar + 0.7152 * ag + 0.0722 * ab) / 255;
    const sat = s * 100;

    rootStyle.setProperty('--accent-rgb', `${ar}, ${ag}, ${ab}`);
    rootStyle.setProperty('--on-accent', lum > 0.5 ? '#0b0b0b' : '#ffffff');
    rootStyle.setProperty('--bg', isLight
        ? `hsl(${h}, ${Math.min(sat, 60)}%, 95%)`
        : `hsl(${h}, ${Math.min(sat, 40)}%, 4%)`);
    rootStyle.setProperty('--panel-solid', isLight
        ? 'rgba(255, 255, 255, 0.88)'
        : `hsla(${h}, ${Math.min(sat, 35)}%, 8%, 0.85)`);
}

function clearCustomVars() {
    CUSTOM_VARS.forEach(v => rootStyle.removeProperty(v));
}

function applyTheme(name) {
    if (!THEME_NAMES[name]) name = 'green';

    const root = document.documentElement;
    root.setAttribute('data-theme', name);

    if (name === 'custom') {
        root.setAttribute('data-base', customState.base);
        applyCustomVars();
        themeName.textContent = `Kustom · ${customState.color.toUpperCase()}`;
    } else {
        root.removeAttribute('data-base');
        clearCustomVars();
        themeName.textContent = THEME_NAMES[name];
    }

    customColor.value = customState.color;
    baseBtns.forEach(b => b.classList.toggle('selected', b.dataset.base === customState.base));
    swatches.forEach(s => s.classList.toggle('selected', s.dataset.theme === name));

    // Menyimpan tema ke localStorage agar tetap tersimpan saat halaman ditutup/di-refresh
    try {
        localStorage.setItem('selectedTheme', name);
        localStorage.setItem('customThemeState', JSON.stringify(customState));
    } catch (e) {
        console.error('Gagal menyimpan tema:', e);
    }
}

themeToggle.addEventListener('click', () => {
    themePanel.classList.toggle('open');
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.theme-picker')) themePanel.classList.remove('open');
});

swatches.forEach(s => {
    s.addEventListener('click', () => applyTheme(s.dataset.theme));
});

customColor.addEventListener('input', () => {
    customState.color = customColor.value;
    applyTheme('custom');
});

baseBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        customState.base = btn.dataset.base;
        applyTheme('custom');
    });
});

// Memuat tema terakhir yang disimpan di localStorage saat halaman pertama kali dibuka
window.addEventListener('DOMContentLoaded', () => {
    try {
        const savedTheme = localStorage.getItem('selectedTheme');
        const savedCustomState = localStorage.getItem('customThemeState');

        if (savedCustomState) {
            const parsed = JSON.parse(savedCustomState);
            if (parsed && parsed.color) {
                customState = parsed;
            }
        }

        if (savedTheme) {
            applyTheme(savedTheme);
        } else {
            applyTheme('green'); // Tema default
        }
    } catch (e) {
        applyTheme('green');
    }
});