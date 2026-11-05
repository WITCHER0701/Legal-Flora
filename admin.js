(function () {
            'use strict';
            var $ = function (id) { return document.getElementById(id); };
            var csrfToken = '';
            var leadOffset = 0, eventOffset = 0, pageSize = 50;

            function toast(msg, isErr) {
                var t = $('toast');
                t.textContent = msg;
                t.classList.toggle('err', !!isErr);
                t.classList.add('show');
                setTimeout(function () { t.classList.remove('show'); }, 2600);
            }

            function api(path, body) {
                return fetch('/api/admin/' + path, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                    credentials: 'same-origin',
                    cache: 'no-store',
                    body: JSON.stringify(body || {})
                }).then(function (r) {
                    return r.json().then(function (j) { return { status: r.status, json: j }; });
                });
            }

            function esc(s) {
                return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
                    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
                });
            }

            function fmtWhen(ts) {
                var d = ts instanceof Date ? ts : new Date(ts);
                if (isNaN(d.getTime())) return String(ts || '');
                return d.toLocaleString();
            }

            /* ---------------- login ---------------- */
            function doLogin() {
                var u = $('user').value.trim(), p = $('pass').value;
                $('gateError').textContent = '';
                api('login', { username: u, password: p }).then(function (r) {
                    if (r.status === 200) { csrfToken = r.json.csrf_token || ''; enter(); }
                    else $('gateError').textContent = (r.json && r.json.error) || 'Login failed';
                }).catch(function () { $('gateError').textContent = 'Server unreachable'; });
            }
            $('loginBtn').addEventListener('click', doLogin);
            ['user', 'pass'].forEach(function (id) {
                $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
            });

            // If already logged in (session cookie), skip the gate
            fetch('/api/admin/data?lead_limit=50&event_limit=50&login_limit=10&consent_limit=10', { credentials: 'same-origin', cache: 'no-store' })
                .then(function (r) { return r.status === 200 ? r.json() : null; })
                .then(function (data) { if (data) enter(data); });

            /* ---------------- dashboard ---------------- */
            function enter(initialData) {
                $('gate').style.display = 'none';
                $('dash').style.display = 'block';
                load(initialData);
            }

            var EV_LABELS = {
                visit: 'Visited the page',
                leave: 'Left the page',
                lead_popup_open: 'Opened the lead popup',
                lead_popup_close: 'Closed the lead popup',
                popup_submit: 'Submitted the popup form',
                cta_click: 'Clicked CTA / button',
                section_view: 'Viewed a section',
                contact_submit: 'Submitted the contact form'
            };

            var loadingData = false;
            function load(initialData) {
                if (loadingData) return;
                loadingData = true;
                (initialData ? Promise.resolve({ status: 200, json: function () { return Promise.resolve(initialData); } })
                    : fetch('/api/admin/data?lead_offset=' + leadOffset + '&event_offset=' + eventOffset + '&lead_limit=' + pageSize + '&event_limit=' + pageSize + '&login_limit=10&consent_limit=10', { credentials: 'same-origin', cache: 'no-store' }))
                    .then(function (r) {
                        if (r.status === 401) { $('dash').style.display = 'none'; $('gate').style.display = 'flex'; throw 0; }
                        return r.json();
                    })
                    .then(function (d) {
                        csrfToken = d.csrf_token || csrfToken;
                        var s = d.stats || {};
                        var kpis = [
                            ['Leads', s.leads_total, 'green'],
                            ['Unique visitors', s.unique_visitors],
                            ['Page visits', s.visits_total],
                            ['Contact clicks', s.cta_clicks],
                            ['Total activity', s.events_total],
                            ['Admin sign-ins', s.logins_total],
                            ['Analytics allowed', s.consent_accepts],
                            ['Analytics declined', s.consent_declines]
                        ];
                        $('kpis').innerHTML = kpis.map(function (k) {
                            return '<div class="kpi"><div class="num" style="' + (k[2] === 'green' ? 'color:#067a47' : '') + '">' +
                                esc(k[1] == null ? '-' : k[1]) + '</div><div class="lbl">' + esc(k[0]) + '</div></div>';
                        }).join('');

                        var leads = d.leads || [];
                        $('leadsCount').textContent = (s.leads_total || 0) + ' total';
                        $('leadsEmpty').style.display = leads.length ? 'none' : 'block';
                        $('leadsBody').innerHTML = leads.map(function (l) {
                            return '<tr><td>' + esc((l.received || '').split(' ').slice(0, 2).join(' ')) + '</td>' +
                                '<td class="lead-cell"><b>' + esc(l.name) + '</b>' +
                                '<small>' + esc(l.email) + ' &middot; ' + esc(l.phone) + '</small></td>' +
                                '<td><span class="pill green">' + esc(l.source || 'website') + '</span></td></tr>';
                        }).join('');

                        var events = d.events || [];
                        $('eventsBody').innerHTML = events.length ? events.map(function (e) {
                            var type = e.type || 'event';
                            var what = EV_LABELS[type] || type;
                            var extra = [];
                            if (type === 'leave' && e.dur != null) extra.push(Math.round(e.dur) + 's on page');
                            if (e.w && e.h) extra.push(e.w + 'x' + e.h);
                            if (e.lang) extra.push(e.lang);
                            if (e.target) extra.push(e.target);
                            var dot = type === 'visit' ? 'green' : (type === 'leave' ? 'gray' : '');
                            return '<div class="ev-line"><span class="ev-dot ' + dot + '"></span><div>' +
                                '<div>' + esc(what) + (extra.length ? ' <span class="ev-meta">(' + esc(extra.join(' &middot; ')) + ')</span>' : '') + '</div>' +
                                '<div class="ev-meta">' + esc(e.id || '') + ' &middot; ' + esc(fmtWhen(e.received)) + '</div></div></div>';
                        }).join('') : '<div class="empty">No tracked activity yet (visits appear once visitors accept Analytics cookies).</div>';
                        $('loginsBody').innerHTML = (d.logins || []).length ? d.logins.map(function (x) {
                            return '<div class="ev-line"><div><b>' + esc(x.success ? 'Signed in' : 'Failed sign-in') + '</b> · ' + esc(x.email) +
                                '<div class="ev-meta">' + esc(fmtWhen(x.occurred_at)) + '</div></div></div>';
                        }).join('') : '<div class="empty">No sign-ins recorded yet.</div>';
                        $('consentsBody').innerHTML = (d.consents || []).length ? d.consents.map(function (x) {
                            return '<div class="ev-line"><div><b>' + esc(x.accepted ? 'Allowed analytics' : 'Declined analytics') + '</b>' +
                                '<div class="ev-meta">' + esc(fmtWhen(x.received)) + '</div></div></div>';
                        }).join('') : '<div class="empty">No cookie choices recorded yet.</div>';
                        $('leadsPage').textContent = (leads.length ? leadOffset + 1 : 0) + '–' + (leadOffset + leads.length) + ' of ' + (s.leads_total || 0);
                        $('eventsPage').textContent = (events.length ? eventOffset + 1 : 0) + '–' + (eventOffset + events.length) + ' of ' + (s.events_total || 0);
                        $('leadsPrev').disabled = leadOffset === 0;
                        $('leadsNext').disabled = leadOffset + leads.length >= (s.leads_total || 0);
                        $('eventsPrev').disabled = eventOffset === 0;
                        $('eventsNext').disabled = eventOffset + events.length >= (s.events_total || 0);
                    })
                    .catch(function (e) { if (e !== 0) toast('Could not load data', true); })
                    .finally(function () { loadingData = false; });
            }

            /* ---------------- logout ---------------- */
            $('logoutBtn').addEventListener('click', function () {
                api('logout').then(function (r) {
                    if (r.status !== 200) { toast('Could not log out', true); return; }
                    csrfToken = '';
                    $('dash').style.display = 'none';
                    $('gate').style.display = 'flex';
                    $('pass').value = '';
                    toast('Logged out');
                });
            });

            $('refreshBtn').addEventListener('click', function () { load(); });
            $('leadsPrev').addEventListener('click', function () { leadOffset = Math.max(0, leadOffset - pageSize); load(); });
            $('leadsNext').addEventListener('click', function () { leadOffset += pageSize; load(); });
            $('eventsPrev').addEventListener('click', function () { eventOffset = Math.max(0, eventOffset - pageSize); load(); });
            $('eventsNext').addEventListener('click', function () { eventOffset += pageSize; load(); });

            /* ---------------- chat backend config API ---------------- */
            function chatConfigApi(action, cfg) {
                return api('chat-config', { action: action, config: cfg });
            }

            function loadChatConfig() {
                chatConfigApi().then(function (r) {
                    if (r.status !== 200 || !r.json || !r.json.config) {
                        $('chatCfgError').textContent = (r.json && r.json.error) || 'Could not load config';
                        return;
                    }
                    var c = r.json.config;
                    $('chatProvider').value = c.provider || '';
                    $('chatBaseUrl').value = c.base_url || '';
                    $('chatModel').value = c.model || '';
                    $('chatApiKey').value = '';
                    $('chatSystemPrompt').value = c.system_prompt || '';
                    $('chatCfgError').textContent = '';
                });
            }

            function saveChatConfig() {
                var prov = $('chatProvider').value.trim().toLowerCase();
                var model = $('chatModel').value.trim();
                var key = $('chatApiKey').value;
                if (prov && !model) { $('chatCfgError').textContent = 'Choose a provider and enter a model'; return; }
                if (prov && !key) { $('chatCfgError').textContent = 'Enter the API key for this model'; return; }
                if (prov && prov !== 'openai' && prov !== 'gemini') { $('chatCfgError').textContent = 'Supported providers: openai, gemini'; return; }
                $('chatCfgError').textContent = '';
                chatConfigApi('set', {
                    provider: prov,
                    base_url: $('chatBaseUrl').value.trim(),
                    api_key: key,
                    model: model,
                    system_prompt: $('chatSystemPrompt').value.trim()
                }).then(function (r) {
                    if (r.status === 200) {
                        $('chatCfgModal').classList.remove('show');
                        ['chatProvider', 'chatBaseUrl', 'chatModel', 'chatApiKey', 'chatSystemPrompt'].forEach(function (i) { $(i).value = ''; });
                        toast('Chat backend saved');
                    } else {
                        $('chatCfgError').textContent = (r.json && r.json.error) || 'Failed to save';
                    }
                });
            }

            function resetChatConfig() {
                if (!confirm('Clear the chat backend configuration? The on-screen chat bot will fall back to the built-in FAQ.')) return;
                chatConfigApi('reset').then(function (r) {
                    if (r.status === 200) {
                        $('chatCfgModal').classList.remove('show');
                        ['chatProvider', 'chatBaseUrl', 'chatModel', 'chatApiKey', 'chatSystemPrompt'].forEach(function (i) { $(i).value = ''; });
                        toast('Chat backend reset');
                    } else {
                        $('chatCfgError').textContent = (r.json && r.json.error) || 'Failed to reset';
                    }
                });
            }

            /* ---------------- export CSV ---------------- */
            $('exportBtn').addEventListener('click', function () {
                var a = document.createElement('a');
                a.href = '/api/admin/export';
                a.download = 'legalflora-data.csv';
                document.body.appendChild(a);
                a.click();
                a.remove();
            });

            /* ---------------- clear ---------------- */
            $('clearBtn').addEventListener('click', function () {
                if (!confirm('Delete stored leads, site activity and cookie choices? Sign-in history will remain. This cannot be undone.')) return;
                api('clear', {}).then(function (r) {
                    if (r.status !== 200) { toast((r.json && r.json.error) || 'Could not clear data', true); return; }
                    leadOffset = 0; eventOffset = 0;
                    toast('All data cleared'); load();
                }).catch(function () { toast('Could not clear data', true); });
            });

            /* ---------------- chat backend config ---------------- */
            $('chatCfgBtn').addEventListener('click', function () { $('chatCfgModal').classList.add('show'); loadChatConfig(); });
            $('chatCfgCancel').addEventListener('click', function () { $('chatCfgModal').classList.remove('show'); });
            $('chatCfgSave').addEventListener('click', function () { saveChatConfig(); });
            $('chatCfgReset').addEventListener('click', function () { resetChatConfig(); });

            /* ---------------- change password ---------------- */
            $('pwBtn').addEventListener('click', function () { $('pwModal').classList.add('show'); $('pwCurrent').focus(); });
            $('pwCancel').addEventListener('click', function () { $('pwModal').classList.remove('show'); });

            $('pwSave').addEventListener('click', function () {
                var cur = $('pwCurrent').value, nw = $('pwNew').value, nw2 = $('pwNew2').value;
                $('pwError').textContent = '';
                if (nw.length < 12) { $('pwError').textContent = 'New password must be at least 12 characters'; return; }
                if (nw !== nw2) { $('pwError').textContent = 'New passwords do not match'; return; }
                api('change-password', { current_password: cur, new_password: nw }).then(function (r) {
                    if (r.status === 200) {
                        $('pwModal').classList.remove('show');
                        ['pwCurrent', 'pwNew', 'pwNew2'].forEach(function (i) { $(i).value = ''; });
                        toast('Password updated');
                    } else {
                        $('pwError').textContent = (r.json && r.json.error) || 'Failed';
                    }
                });
            });
        })();
