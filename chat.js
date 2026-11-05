/* Chat assistant */
(function () {
    'use strict';

    /* ---------------- Chatbot behaviour (FAQ-backed assistant) ---------------- */
    (function () {
        'use strict';

        var wrapper = document.getElementById('chatbotPanel');
        if (!wrapper) return;

        var launcher = document.getElementById('chatbotLauncher');
        var panel = wrapper;
        var closeBtn = wrapper.querySelector('.chatbot-close');
        var messages = wrapper.querySelector('.chatbot-messages');
        var input = wrapper.querySelector('.chatbot-input');
        var sendBtn = wrapper.querySelector('.chatbot-send');

        if (!launcher || !panel || !messages || !input || !sendBtn) return;

        var SERVICE_FAQ = [
            // 1. DPIIT / Startup India — specific recognition intent wins over generic startup talk
            {
                pattern: /startup india|dpiit|startup recognition|startupindia|recogni[sz]ation under startup|startup recognition certificate/i,
                answer: 'We check whether your startup is eligible for DPIIT recognition, help prepare the required documents, and submit the application. Any benefits depend on the current scheme rules and your eligibility.'
            },
            // 2. MSME / Udyam — explicit so it beats the broader legal/compliance pattern
            {
                pattern: /msme registration|msme|udyam registration|udyam|udyog|msme u dyam|micro small and medium|define msme status|register as msme/i,
                answer: 'We handle MSME/Udyam registration for micro, small and medium enterprises. Udyam registration is free and online, but the process can be confusing. We help you choose the right category, prepare the documents, and complete the registration so you can access MSME benefits.'
            },
            // 3. Incorporation / business setup — specific structure words, not the bare word startup
            {
                pattern: /private limited|pvt ltd|llp|one person company|opc|section 8|incorporation|register a company|register my company|register an llp|form a company|company registration|incorporate/i,
                answer: 'We help register Private Limited companies, LLPs, OPCs, partnerships, proprietorships and NGOs. We can explain the documents, prepare the forms and help with filing.'
            },
            // 4. NGO / trust / society / nonprofit setup
            {
                pattern: /ngo|nonprofit|non-profit|trust|society|section 8 company|registered association|register a trust|register a society|register an ngo|form a trust|form a society/i,
                answer: 'We help set up NGOs, trusts, societies and Section 8 companies, including name approval, registration with the relevant registrar or registrar of societies, MoA/MoA-equivalent, and post-registration compliance so you can operate legally and apply for grants where eligible.'
            },
            // 5. Government funding / schemes — named schemes get a concrete answer
            {
                pattern: /pmegp|mudra|cgtmse|seed fund|startup india seed fund|innovation grant|agri[bg]usiness programme|agri-tech grant|scheme|sector scheme|which scheme am i eligible|find a scheme|government scheme|subsidy for|grant for/i,
                answer: 'We check which central or state schemes may fit your business, then help prepare the application and documents. This may include Startup India Seed Fund, PMEGP, Mudra or CGTMSE. The authority decides eligibility and approval.'
            },
            // 6. Funding / investor / financing-generic (when no named scheme is mentioned)
            {
                pattern: /funding|raise money|how to get funding|how to raise|i want funding|investor|seed funding|vc|venture capital|angel investor|angel funding|business loan|working capital loan|term loan|loan|financial support|amount needed|fund|i want a loan/i,
                answer: 'We help check funding scheme rules and prepare applications. We can also explain private funding options if they fit your business. We do not take equity for advisory work.'
            },
            // 7. Incubation / accelerator / pitching / mentor
            {
                pattern: /incubat|incubation|incubator|accelerat|accelerator|mentor|dpr|detailed project report|demo day|ecosystem|workspace|co-working|get into an incubator/i,
                answer: 'We support incubation and accelerator programmes, including guidance on applying to incubators, preparing pitch materials, and matching you with mentors and institutional support. If you are unsure where to start, tell us what stage your venture is at and we will suggest a path.'
            },
            // 8. Patent filing — standalone answer so pure patent questions don't fall to compliance
            {
                pattern: /file a patent|file patents|patent an idea|patent filing|patent application|register a patent|patent my invention|patent for startup|how to file a patent|patent|drafted a patent|filing a patent|apply for a patent|patent grant/i,
                answer: 'We help startups file patent applications, including prior-art checks, drafting the specification, selecting the right claim strategy, and filing with the Indian Patent Office. We can also advise on provisional versus complete applications and on the startups fast-track option where eligible.'
            },
            // 9. Trademark / brand / logo / IP (broader IP when no patent-specific intent)
            {
                pattern: /trademark|brand name|register a brand|logo protection|brand registration|register a trademark|trademark my brand|intellectual property|ip rights|copyright|protect my brand|register my brand|my brand name/i,
                answer: 'We offer trademark and brand-protection support, including name availability searches, classification, filing the trademark application, and following it through examination and registration. We can also guide you on copyright where relevant and on basic business agreements and compliance.'
            },
            // 10. GST / tax / compliance (when no IP-specific intent)
            {
                pattern: /gst|goods and services tax|income tax return|tax compliance|annual filing|company compliance|tax return|tax filing|audit|compliance for startup|tax for startup|returns|gst return|file gst|register for gst|vat|taxes/i,
                answer: 'We handle GST registration, GST returns and income-tax compliance for startups and growing businesses, including annual filings, TDS where applicable, and basic company compliance so you stay on the right side of the law as you scale.'
            },
            // 11. Legal / contracts / general business agreements — bare 'legal' kept broad but after services/identity
            {
                pattern: /contract|agreement|deals|terms of service|privacy policy|founder agreement|nda|non-disclosure|non disclosure|employment agreement|vendor agreement|legal help|legal support|draft an agreement|prepare an agreement|business agreement/i,
                answer: 'We offer legal and compliance support, including preparing basic business agreements, founder agreements, NDAs, terms of service and privacy-policy drafting support, and help with compliance. For complex legal matters we will advise you on the right specialist.'
            },
            // 12. Cost / pricing / fees / estimate
            {
                pattern: /cost|fee|charge|price|how much|afford|cheap|free|pricing|estimate|rough estimate|rough range|how much does it cost|how much to register|i want a quote/i,
                answer: 'Our fees depend on the service and the complexity of your case. Many government registrations can be done with minimal professional fees because the government charges are small or zero. For a quick estimate, tell us what you need and we will respond with a rough range and next steps. Note: we do not guarantee any funding or government disbursement — that is decided by the relevant government authority.'
            },
            // 13. Digital marketing / website / online presence
            {
                pattern: /google ads|google adwords|facebook ads|meta ads|social media marketing|digital marketing|run ads|online ads|build a website|website design|make a website|website for business|website development|online presence|marketing your business|seo|set up ads|run google ads|google ad|create a website|make my website|web development|web design/i,
                answer: 'We can set up a basic business website and help with Google or Meta ads and SEO basics. Tell us what you need customers to find online.'
            },
            // 14. Contact / how to reach / start the process — strong contact signals win even with 'team' present
            {
                pattern: /contact us|contact|phone|mobile|whatsapp number|whatsapp|email address|email|reach you|reach your team|talk to|speak to|call|support team|talk to someone|talk to your team|start the process|how do i start the process|how to reach|how to get started|book a call|speak to an expert|hello|hi|hey|get in touch|how can i contact|can i talk|connect with you|contact the team|reach me|need to talk|need to speak/i,
                answer: 'You can call or WhatsApp us at +91-9358849638, email info@legalflora.com, or send the contact form on this page.'
            },
            // 15. Equity / ownership / co-founder / partnership
            {
                pattern: /equity|stake|share|ownership|investor|buy into|buy in|partnership|partner|co-founder|take equity|do you take equity|do you want equity|in exchange for services/i,
                answer: 'We do not ask for equity in your business for our advisory or registration services. We are paid for the work we do, not for a share of your company. If you are looking for co-founders or equity investment, we can point you to suitable options.'
            },
            // 16. Who are you / where are you located / identity & trust — strong signals, after contact so 'your team' reaches contact first
            {
                pattern: /who are you|who is|tell me about|about you|about the company|about the team|where are you|where is your office|where are your offices|where is legal flora|where is the company|where do you operate|where are you based|location of|location|city|jaipur|rajasthan|based in|this site|this website|this company|this business|legal flora|legalflora|who runs|who owns|who founded|founder of the company|your company|about the firm|what is your background/i,
                answer: 'We are a Jaipur-based business consultancy helping startups, MSMEs, entrepreneurs and NGOs to set up, certify, fund and grow their ventures. You can contact our team by phone, WhatsApp, or email.'
            },
            // 17. What services do you offer / what do you do — answered near-last, before generic start
            {
                pattern: /what services do you offer|what do you do|what do you provide|what can you do for me|what is your work|your services|services you provide|what kind of services|what are your services|what do you help with|what do you help|i need help with something|tell me about your services|what does your company do/i,
                answer: 'We help with company and MSME registration, DPIIT recognition, government scheme applications, GST and legal paperwork, and basic website setup. Tell us what you need first.'
            },
            // 18. Generic start / first step — last resort, after all specific intents
            {
                pattern: /how do i start|where do i start|starting a business|first step|ready to start|starting up|steps to start|how to start|new business|early stage|early-stage|founder|just starting|i want to start/i,
                answer: 'First, tell us what your business does and whether it is already registered. We can then explain which registration, documents or scheme application to handle next.'
            }
        ];

        var fallbackAnswer = 'That is a good question. I can help with business setup, MSME/Udyam registration, government funding and schemes, startup incubation, patents and trademarks, and general compliance. Tell me a bit more about what you need and I will guide you to the right service.';

        // Session‑level memory so the chatbot doesn’t repeat the same FAQ answer
        var answeredThisSession = [];
        function alreadyAnswered(answer) {
            return answeredThisSession.includes(answer);
        }
        function markAnswered(answer) {
            answeredThisSession.push(answer);
            // Keep it from growing without bound
            if (answeredThisSession.length > 20) answeredThisSession.shift();
        }

        function findAnswer(text) {
            var best = null, bestScore = 0;
            for (var i = 0; i < SERVICE_FAQ.length; i++) {
                var m = text.match(SERVICE_FAQ[i].pattern);
                if (m) {
                    var score = m[0].length;
                    if (score > bestScore) {
                        bestScore = score;
                        best = SERVICE_FAQ[i].answer;
                    }
                }
            }
            if (!best) {
                for (var j = 0; j < SERVICE_FAQ.length; j++) {
                    if (SERVICE_FAQ[j].pattern.test(text)) {
                        best = SERVICE_FAQ[j].answer;
                        break;
                    }
                }
            }
            if (best && alreadyAnswered(best)) {
                // Return null so the FAQ fallback is skipped and the server is asked instead
                return null;
            }
            return best || fallbackAnswer;
        }

        function addMessage(text, type) {
            var el = document.createElement('div');
            el.className = 'chatbot-msg ' + (type || 'bot');
            el.textContent = String(text == null ? '' : text);
            messages.appendChild(el);
            messages.scrollTop = messages.scrollHeight;
        }

        function thinking() {
            var el = document.createElement('div');
            el.className = 'chatbot-msg bot';
            el.id = 'chatbotThinking';
            el.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite;border:2px solid rgba(124,58,237,0.3);border-top-color:var(--secondary);border-radius:50%;width:12px;height:12px;margin-right:6px;vertical-align:middle;"></span> Checking our knowledge base…';
            messages.appendChild(el);
            messages.scrollTop = messages.scrollHeight;
        }

        function removeThinking() {
            var el = document.getElementById('chatbotThinking');
            if (el) el.remove();
        }

        function send() {
            var text = input.value.trim();
            if (!text) return;
            input.value = '';
            addMessage(text, 'user');
            thinking();
            sendBtn.disabled = true;
            var faqReply = findAnswer(text);
            // Offline-first: ask the server first; if it is unavailable or slow, fall back to the
            // local FAQ. When the server has a configured AI backend, the reply is tagged 'ai' so we
            // can label it in the chat.
            var st = Date.now();
            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/chat', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.timeout = 2500;
            xhr.onload = function () {
                removeThinking();
                var source = 'kb';
                try {
                    var j = JSON.parse(xhr.responseText);
                    if (j && typeof j.reply === 'string') {
                        addMessage(j.reply, j.source === 'ai' ? 'bot-ai' : 'bot');
                        if (j.source === 'ai' && j.reply) { markAnswered(j.reply); source = 'ai'; }
                        sendBtn.disabled = false;
                        return;
                    }
                } catch (e) {}
                if (faqReply && faqReply !== '' && !alreadyAnswered(faqReply)) {
                    markAnswered(faqReply);
                    addMessage(faqReply, 'bot');
                }
                sendBtn.disabled = false;
            };
            xhr.ontimeout = function () {
                removeThinking();
                if (faqReply && faqReply !== '' && !alreadyAnswered(faqReply)) {
                    markAnswered(faqReply);
                    addMessage(faqReply, 'bot');
                }
                sendBtn.disabled = false;
            };
            xhr.onerror = function () {
                removeThinking();
                if (faqReply && faqReply !== '' && !alreadyAnswered(faqReply)) {
                    markAnswered(faqReply);
                    addMessage(faqReply, 'bot');
                }
                sendBtn.disabled = false;
            };
            try { xhr.send(JSON.stringify({ message: text })); } catch (e) { addMessage(faqReply || '…', 'bot'); sendBtn.disabled = false; }
            setTimeout(function () {
                if (sendBtn.disabled) {
                    removeThinking();
                    var replyEl = document.getElementById('chatbotThinking');
                    if (replyEl) replyEl.remove();
                    if (faqReply && faqReply !== '' && !alreadyAnswered(faqReply)) {
                        markAnswered(faqReply);
                        addMessage(faqReply, 'bot');
                    }
                    sendBtn.disabled = false;
                }
            }, 2800);
        }

        function openChat() {
            panel.classList.add('show');
            launcher.classList.add('active');
            launcher.setAttribute('aria-expanded', 'true');
            input.focus();
        }

        function closeChat() {
            panel.classList.remove('show');
            launcher.classList.remove('active');
            launcher.setAttribute('aria-expanded', 'false');
            launcher.focus();
        }

        launcher.addEventListener('click', function (e) {
            if (panel.classList.contains('show')) closeChat(); else openChat();
        });
        closeBtn.addEventListener('click', closeChat);
        sendBtn.addEventListener('click', send);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); send(); }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && panel.classList.contains('show')) closeChat();
        });
        panel.addEventListener('click', function (e) {
            if (e.target === panel) closeChat();
        });
        openChat();
    })();
})();

