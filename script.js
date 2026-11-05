document.addEventListener('DOMContentLoaded', () => {
    // --- Loader ---
    const loader = document.getElementById('loader');
    const hideLoader = () => {
        if (loader && !loader.classList.contains('hidden')) {
            loader.classList.add('hidden');
        }
    };
    window.addEventListener('load', () => setTimeout(hideLoader, 300));
    setTimeout(hideLoader, 1500); // Fallback guarantee

    // --- Header Scroll Effect ---
    const header = document.getElementById('header');
    const disclaimerTrack = document.getElementById('disclaimerTrack');
    const disclaimerToggle = document.getElementById('disclaimerToggle');
    disclaimerToggle?.addEventListener('click', () => {
        const paused = disclaimerTrack.classList.toggle('is-paused');
        disclaimerToggle.textContent = paused ? 'Play' : 'Pause';
        disclaimerToggle.setAttribute('aria-label', paused ? 'Play moving disclaimer' : 'Pause moving disclaimer');
        disclaimerToggle.setAttribute('aria-pressed', String(paused));
    });
    window.addEventListener('scroll', () => {
        if (window.scrollY > 40) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    // --- Reveal Animations (Intersection Observer) ---
    const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-zoom');
    if ('IntersectionObserver' in window) {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('active');
                }
            });
        }, {
            threshold: 0.08,
            rootMargin: '0px 0px -40px 0px'
        });
        revealElements.forEach(el => revealObserver.observe(el));
    } else {
        revealElements.forEach(el => el.classList.add('active'));
    }

    // --- Mobile Menu ---
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');

    if (mobileBtn && navLinks) {
        const setMenuOpen = (open) => {
            navLinks.classList.toggle('active', open);
            document.body.classList.toggle('nav-open', open);
            mobileBtn.setAttribute('aria-expanded', String(open));
            mobileBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
            const icon = mobileBtn.querySelector('i');
            if (icon) icon.className = open ? 'fas fa-times' : 'fas fa-bars';
        };
        mobileBtn.addEventListener('click', () => {
            const opening = !navLinks.classList.contains('active');
            setMenuOpen(opening);
            if (opening) navLinks.querySelector('a')?.focus();
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    setMenuOpen(false);
                }
            });
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && navLinks.classList.contains('active')) {
                setMenuOpen(false);
                mobileBtn.focus();
            }
        });
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) setMenuOpen(false);
        });
    }

    // --- Consultation enquiry ---
    const dialog = document.getElementById('consultationDialog');
    const contactForm = document.getElementById('contactForm');
    const status = document.getElementById('formStatus');
    let opener = null;
    const promptKey = 'lf_consultation_prompt_seen';
    const submittedKey = 'lf_consultation_submitted';
    const hasSubmitted = () => {
        try { if (localStorage.getItem(submittedKey) === 'yes') return true; } catch { /* Use the cookie fallback. */ }
        return document.cookie.split('; ').includes('lf_consultation_sent=yes');
    };
    const markSubmitted = () => {
        try { localStorage.setItem(submittedKey, 'yes'); } catch { /* Use the cookie fallback. */ }
        document.cookie = `lf_consultation_sent=yes; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    };
    const promptSeen = () => {
        if (hasSubmitted()) return true;
        try { return sessionStorage.getItem(promptKey) === 'yes'; } catch { return false; }
    };
    const markPromptSeen = () => {
        try { sessionStorage.setItem(promptKey, 'yes'); } catch { /* Popup still works without storage. */ }
    };

    const setStatus = (message) => { if (status) status.textContent = message; };
    const postJson = async (path, payload) => {
        const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 404) throw new Error('The consultation API is unavailable in this preview.');
        if (!response.ok) throw new Error(data.error || 'Request could not be completed.');
        return data;
    };
    const busy = (form, value) => { if (form) form.querySelector('button[type="submit"]').disabled = value; };
    const openConsultation = (control) => {
        if (!dialog?.showModal || dialog.open) return;
        opener = control || document.activeElement;
        markPromptSeen();
        dialog.showModal();
        if (hasSubmitted()) {
            contactForm.hidden = true;
            setStatus('We already have your details. Our team will contact you soon.');
            document.getElementById('consultationClose')?.focus();
        } else {
            contactForm.hidden = false;
            setStatus('');
            contactForm?.elements.name.focus();
        }
    };
    document.querySelectorAll('[data-consultation]').forEach(control => {
        control.addEventListener('click', event => {
            if (!dialog?.showModal) return;
            event.preventDefault();
            openConsultation(control);
        });
    });
    let autoPromptTimer;
    const scheduleAutoPrompt = (delay) => {
        if (!dialog || promptSeen()) return;
        window.clearTimeout(autoPromptTimer);
        autoPromptTimer = window.setTimeout(() => {
            if (promptSeen() || document.visibilityState !== 'visible' || document.body.classList.contains('nav-open')) return;
            openConsultation();
        }, delay);
    };
    document.getElementById('consultationClose')?.addEventListener('click', () => dialog.close());
    dialog?.addEventListener('close', () => opener?.focus());
    if (contactForm) {
        contactForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            busy(contactForm, true);
            setStatus('Sending your request…');
            const fields = Object.fromEntries(new FormData(contactForm));
            try {
                await postJson('/api/lead', fields);
                markSubmitted();
                window.clearTimeout(autoPromptTimer);
                contactForm.reset();
                contactForm.hidden = true;
                setStatus('Thanks. We received your details and will contact you soon.');
            } catch (error) {
                setStatus(error.message);
            } finally {
                busy(contactForm, false);
            }
        });
    }

    // Optional first-party analytics. No event is sent until the visitor opts in.
    const consentBanner = document.getElementById('consentBanner');
    const readChoice = () => document.cookie.split('; ').find(part => part.startsWith('lf_analytics='))?.split('=')[1];
    const showConsent = (visible) => {
        if (!consentBanner) return;
        consentBanner.hidden = !visible;
        document.body.classList.toggle('consent-open', visible);
    };
    let fallbackVisitorId;
    const visitorId = () => {
        let id;
        try { id = sessionStorage.getItem('lf_visitor'); } catch { id = fallbackVisitorId; }
        if (!id) {
            id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
            fallbackVisitorId = id;
            try { sessionStorage.setItem('lf_visitor', id); } catch { /* Storage may be disabled. */ }
        }
        return id;
    };
    const saveChoice = (choice) => {
        document.cookie = `lf_analytics=${choice}; Max-Age=15552000; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
        showConsent(false);
        fetch('/api/consent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: visitorId(), accepted: choice === 'yes' })
        }).catch(() => {});
        if (choice === 'yes') track('visit', { page: location.pathname });
        scheduleAutoPrompt(1500);
    };
    const track = (type, payload = {}) => {
        if (readChoice() !== 'yes') return;
        fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ consent: true, type, id: visitorId(), ...payload })
        }).catch(() => {});
    };
    showConsent(!readChoice());
    if (readChoice()) scheduleAutoPrompt(8000);
    if (readChoice() === 'yes') track('visit', { page: location.pathname });
    document.getElementById('consentAccept')?.addEventListener('click', () => saveChoice('yes'));
    document.getElementById('consentReject')?.addEventListener('click', () => saveChoice('no'));
    document.getElementById('cookieChoices')?.addEventListener('click', (event) => {
        event.preventDefault();
        showConsent(true);
    });
    document.querySelectorAll('a[href^="tel:"], a[href^="mailto:"], a[href="#contact"]').forEach(link => {
        link.addEventListener('click', () => track('cta_click', { target: link.getAttribute('href')?.split(':')[0] || 'form' }));
    });

    // Load the FAQ assistant only when a visitor opens it.
    const chatLauncher = document.getElementById('chatbotLauncher');
    let chatLoading = false;
    let chatLoaded = false;
    chatLauncher?.addEventListener('click', () => {
        if (chatLoading || chatLoaded) return;
        chatLoading = true;
        const script = document.createElement('script');
        script.src = typeof CHAT_ASSET === 'undefined' ? 'chat.js' : CHAT_ASSET;
        script.onload = () => { chatLoading = false; chatLoaded = true; };
        script.onerror = () => {
            chatLoading = false;
            script.remove();
            chatLauncher.setAttribute('aria-label', 'Chat unavailable. Try again');
        };
        document.head.appendChild(script);
    });

});
