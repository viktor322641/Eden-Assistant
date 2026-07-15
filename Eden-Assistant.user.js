// ==UserScript==
// @name         Eden Assistant
// @namespace    eden-assistant
// @version      0.7
// @description  Opens Eden 1 Vue and enters WIP 31583 into the correct WIP field without searching
// @match        https://login.eden1vision.com/*
// @match        https://eden.dealfile.co.uk/*
// @updateURL    https://raw.githubusercontent.com/viktor322641/Eden-Assistant/main/Eden-Assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/viktor322641/Eden-Assistant/main/Eden-Assistant.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const WIP_NUMBER = "31583";
    const AUTO_HASH = "#eden-assistant-enter-wip";

    const sleep = milliseconds =>
        new Promise(resolve => setTimeout(resolve, milliseconds));

    function normalise(text) {
        return String(text || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

    function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function setStatus(message, isError = false) {
        console.log("[Eden Assistant]", message);
        const status = document.getElementById("edenAssistantStatus");
        if (!status) return;
        status.textContent = message;
        status.style.background = isError ? "#b71c1c" : "#263238";
    }

    async function waitForElement(finder, timeoutMilliseconds = 15000) {
        const started = Date.now();
        while (Date.now() - started < timeoutMilliseconds) {
            const element = finder();
            if (element) return element;
            await sleep(400);
        }
        return null;
    }

    function setInputValue(input, value) {
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )?.set;

        if (setter) setter.call(input, value);
        else input.value = value;

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    }

    function findEdenVueLink() {
        const label = [...document.querySelectorAll("a, div, span, button")]
            .find(element =>
                isVisible(element) &&
                normalise(element.textContent) === "eden 1 vue"
            );
        return label?.closest("a") || label || null;
    }

    async function openEdenVue() {
        setStatus("Looking for Eden 1 Vue...");
        const link = await waitForElement(findEdenVueLink, 10000);

        if (!link) {
            setStatus("Eden 1 Vue tile not found", true);
            return;
        }

        setStatus("Opening Eden 1 Vue...");

        if (link.tagName === "A" && link.href) {
            window.location.href = link.href.split("#")[0] + AUTO_HASH;
            return;
        }

        link.click();
    }

    async function enterWip() {
        setStatus("Looking for WIP field...");

        const input = await waitForElement(() => {
            const element = document.getElementById("x_searchwip");
            return isVisible(element) ? element : null;
        });

        if (!input) {
            setStatus("WIP field #x_searchwip not found", true);
            return;
        }

        input.scrollIntoView({ behavior: "smooth", block: "center" });
        input.focus();
        setInputValue(input, WIP_NUMBER);
        input.style.outline = "4px solid #ffeb3b";
        input.style.outlineOffset = "3px";
        input.style.background = "#fff59d";

        setStatus(`WIP ${WIP_NUMBER} entered — Search not pressed`);
    }

    async function runAssistant() {
        const button = document.getElementById("edenAssistantButton");
        if (button) {
            button.disabled = true;
            button.textContent = "WORKING...";
        }

        try {
            if (location.hostname === "login.eden1vision.com") {
                await openEdenVue();
            } else if (location.hostname === "eden.dealfile.co.uk") {
                await enterWip();
            } else {
                setStatus("Unsupported page", true);
            }
        } catch (error) {
            console.error(error);
            setStatus(`Error: ${error.message || error}`, true);
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent =
                    location.hostname === "login.eden1vision.com"
                        ? "OPEN EDEN 1 VUE"
                        : `ENTER WIP ${WIP_NUMBER}`;
            }
        }
    }

    function createPanel() {
        if (document.getElementById("edenAssistantPanel")) return;
        if (!document.body) {
            setTimeout(createPanel, 500);
            return;
        }

        const panel = document.createElement("div");
        panel.id = "edenAssistantPanel";
        Object.assign(panel.style, {
            position: "fixed",
            right: "10px",
            bottom: "85px",
            zIndex: "2147483647",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "8px"
        });

        const status = document.createElement("div");
        status.id = "edenAssistantStatus";
        status.textContent = "v0.7 ready";
        Object.assign(status.style, {
            maxWidth: "300px",
            padding: "9px 12px",
            borderRadius: "9px",
            background: "#263238",
            color: "#fff",
            fontSize: "13px",
            boxShadow: "0 3px 10px rgba(0,0,0,.45)"
        });

        const button = document.createElement("button");
        button.id = "edenAssistantButton";
        button.textContent =
            location.hostname === "login.eden1vision.com"
                ? "OPEN EDEN 1 VUE"
                : `ENTER WIP ${WIP_NUMBER}`;
        Object.assign(button.style, {
            padding: "14px 17px",
            border: "2px solid white",
            borderRadius: "12px",
            background: "#1565c0",
            color: "#fff",
            fontSize: "15px",
            fontWeight: "bold",
            boxShadow: "0 3px 10px rgba(0,0,0,.45)"
        });

        button.addEventListener("click", runAssistant);
        panel.appendChild(status);
        panel.appendChild(button);
        document.body.appendChild(panel);
    }

    createPanel();

    new MutationObserver(createPanel).observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    if (
        location.hostname === "eden.dealfile.co.uk" &&
        location.hash === AUTO_HASH
    ) {
        history.replaceState(null, "", location.pathname + location.search);
        setTimeout(enterWip, 1200);
    }
})();