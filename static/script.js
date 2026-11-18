(() => {
    "use strict";

    /* ---------- Configuration ---------- */
    const CONFIG = {
        apiBase: "",                       // "" = same origin. If frontend is hosted separately: "https://your-app.onrender.com"
        apiEndpoint: "/api/travel",              // POST { message, thread_id } -> { answer, thread_id, ... }
        requestTimeoutMs: 180000,
        storageKey: "tripmate_thread_id",
        pdfFileName: "TripMate-Travel-Plan.pdf",
    };

    /* ---------- DOM references ---------- */
    const $ = (id) => document.getElementById(id);

    const els = {
        input: $("userInput"),
        sendBtn: $("sendBtn"),
        btnText: $("btnText"),
        btnLoader: $("btnLoader"),
        resultSection: $("resultSection"),
        resultBox: $("resultBox"),
        threadInfo: $("threadInfo"),
        pdfContent: $("pdfContent"),
        errorBox: $("errorBox"),
    };

    /* ---------- State ---------- */
    const state = {
        threadId: loadThreadId(),
        rawMarkdown: "",
        isLoading: false,
        controller: null,
    };

    /* ---------- Thread ID helpers ---------- */
    function generateThreadId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }
        return "thread-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    function loadThreadId() {
        try {
            const saved = sessionStorage.getItem(CONFIG.storageKey);
            if (saved) return saved;
            const id = generateThreadId();
            sessionStorage.setItem(CONFIG.storageKey, id);
            return id;
        } catch {
            return generateThreadId();
        }
    }

    /* ---------- UI helpers ---------- */
    function setLoading(isLoading) {
        state.isLoading = isLoading;
        els.sendBtn.disabled = isLoading;
        els.input.disabled = isLoading;
        els.btnText.textContent = isLoading ? "Generating..." : "Generate Plan";
        els.btnLoader.classList.toggle("hidden", !isLoading);
    }

    function showError(message) {
        els.errorBox.textContent = message;
        els.errorBox.classList.remove("hidden");
    }

    function clearError() {
        els.errorBox.textContent = "";
        els.errorBox.classList.add("hidden");
    }

    function showResult(markdown, threadId) {
        state.rawMarkdown = markdown;

        const html = typeof window.marked !== "undefined"
            ? window.marked.parse(markdown)
            : escapeHtml(markdown).replace(/\n/g, "<br>");

        els.resultBox.innerHTML = sanitizeHtml(html);
        els.threadInfo.textContent = `Thread ID: ${threadId || state.threadId}`;
        els.resultSection.classList.remove("hidden");
        els.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function toast(message) {
        const previous = document.querySelector(".tm-toast");
        if (previous) previous.remove();

        const node = document.createElement("div");
        node.className = "tm-toast";
        node.textContent = message;
        node.setAttribute("role", "status");
        Object.assign(node.style, {
            position: "fixed",
            left: "50%",
            bottom: "28px",
            transform: "translateX(-50%)",
            padding: "12px 20px",
            background: "#0f172a",
            color: "#f8fafc",
            border: "1px solid rgba(148,163,184,0.35)",
            borderRadius: "12px",
            fontSize: "0.92rem",
            boxShadow: "0 12px 30px rgba(2,6,23,0.45)",
            zIndex: "9999",
        });
        document.body.appendChild(node);
        setTimeout(() => node.remove(), 2200);
    }

    /* ---------- Security helpers ---------- */
    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // Minimal sanitizer: strips scripts, inline handlers and javascript: URLs.
    // For stricter guarantees, include DOMPurify and use it here instead.
    function sanitizeHtml(html) {
        const template = document.createElement("template");
        template.innerHTML = html;

        template.content
            .querySelectorAll("script, style, iframe, object, embed, link, meta")
            .forEach((node) => node.remove());

        template.content.querySelectorAll("*").forEach((node) => {
            [...node.attributes].forEach((attr) => {
                const name = attr.name.toLowerCase();
                const value = attr.value.trim().toLowerCase();
                if (name.startsWith("on") || value.startsWith("javascript:")) {
                    node.removeAttribute(attr.name);
                }
            });
            if (node.tagName === "A") {
                node.setAttribute("target", "_blank");
                node.setAttribute("rel", "noopener noreferrer");
            }
        });

        return template.innerHTML;
    }

    /* ---------- Network ---------- */
    async function requestPlan(message) {
        state.controller = new AbortController();
        const timeout = setTimeout(() => state.controller.abort(), CONFIG.requestTimeoutMs);

        try {
            const response = await fetch(CONFIG.apiBase + CONFIG.apiEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message, thread_id: state.threadId }),
                signal: state.controller.signal,
            });

            if (!response.ok) {
                let detail = "";
                try {
                    const body = await response.json();
                    // FastAPI validation errors return `detail` as an array
                    detail = Array.isArray(body.detail)
                        ? body.detail.map((d) => d.msg).join(", ")
                        : body.detail || body.error || "";
                } catch {
                    /* ignore non-JSON error bodies */
                }
                throw new Error(detail || `Request failed with status ${response.status}.`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === "AbortError") {
                throw new Error("The request timed out. Please try again.");
            }
            throw error;
        } finally {
            clearTimeout(timeout);
            state.controller = null;
        }
    }

    /* ---------- Public actions (used by inline onclick handlers) ---------- */
    async function sendMessage() {
        if (state.isLoading) return;

        const message = els.input.value.trim();
        if (!message) {
            showError("Please describe your trip before generating a plan.");
            els.input.focus();
            return;
        }

        clearError();
        setLoading(true);

        try {
            const data = await requestPlan(message);
            const raw = data.answer || data.response || data.result || "";
            const text = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);

            if (!text) {
                throw new Error("The server returned an empty response.");
            }

            if (data.thread_id) {
                state.threadId = data.thread_id;
                try {
                    sessionStorage.setItem(CONFIG.storageKey, data.thread_id);
                } catch {
                    /* storage unavailable */
                }
            }

            showResult(text, data.thread_id);
        } catch (error) {
            showError(error.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    function setPrompt(text) {
        els.input.value = text;
        els.input.focus();
        els.input.setSelectionRange(text.length, text.length);
        clearError();
    }

    async function copyResult() {
        const text = state.rawMarkdown || els.resultBox.innerText;
        if (!text) {
            toast("Nothing to copy yet.");
            return;
        }

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const area = document.createElement("textarea");
                area.value = text;
                area.style.position = "fixed";
                area.style.opacity = "0";
                document.body.appendChild(area);
                area.select();
                document.execCommand("copy");
                area.remove();
            }
            toast("Travel plan copied to clipboard.");
        } catch {
            toast("Unable to copy. Please copy the text manually.");
        }
    }

    function downloadPDF() {
        if (!state.rawMarkdown) {
            toast("Generate a plan first.");
            return;
        }
        if (typeof window.html2pdf === "undefined") {
            showError("The PDF library failed to load. Please refresh and try again.");
            return;
        }

        const options = {
            margin: [12, 12, 12, 12],
            filename: CONFIG.pdfFileName,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
            pagebreak: { mode: ["css", "legacy"], avoid: ["h2", "h3", "tr"] },
        };

        window.html2pdf().set(options).from(els.pdfContent).save()
            .catch(() => showError("Failed to generate the PDF. Please try again."));
    }

    /* ---------- Keyboard shortcut: Ctrl/Cmd + Enter to submit ---------- */
    els.input.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            sendMessage();
        }
    });

    /* ---------- Expose handlers for inline onclick attributes ---------- */
    window.sendMessage = sendMessage;
    window.setPrompt = setPrompt;
    window.copyResult = copyResult;
    window.downloadPDF = downloadPDF;
})();