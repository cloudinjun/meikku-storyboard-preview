(() => {
  "use strict";

  /* ======================================================================
     FIXED-STAGE PRESENTATION CONTROLLER
     Keeps the 1920 x 1080 deck intact at every viewport size and provides
     keyboard, wheel, touch, hash, and lightweight copy-editing support.
     ====================================================================== */
  const stage = document.getElementById("deckStage");
  const slides = Array.from(document.querySelectorAll(".slide[data-d1-demo]"));
  if (!stage || slides.length === 0) return;
  const embedMode = document.documentElement.classList.contains("embed-mode");

  const counter = document.getElementById("deckCounter");
  const progress = document.getElementById("deckProgress");
  const slideName = document.getElementById("deckSlideName");
  const editToggle = document.getElementById("editToggle");
  const editHotzone = document.querySelector(".edit-hotzone");
  const editableNodes = Array.from(document.querySelectorAll("[data-editable]"));

  class DeckPresentation {
    constructor() {
      this.currentSlide = embedMode ? Math.min(1, slides.length - 1) : this.readHash();
      this.wheelLocked = false;
      this.touchStart = null;
      this.isEditing = false;
      this.hideEditTimer = null;

      this.setupStageScale();
      if (!embedMode) {
        this.restoreEdits();
        this.setupKeyboardNav();
        this.setupWheelNav();
        this.setupTouchNav();
        this.setupHashNav();
        this.setupEditing();
      }
      this.showSlide(this.currentSlide, false);
    }

    readHash() {
      const match = window.location.hash.match(/slide=(\d+)/);
      if (!match) return 0;
      return Math.max(0, Math.min(Number(match[1]) - 1, slides.length - 1));
    }

    setupStageScale() {
      const scaleStage = () => {
        const factor = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
        const x = (window.innerWidth - 1920 * factor) / 2;
        const y = (window.innerHeight - 1080 * factor) / 2;
        stage.style.transform = `translate(${x}px, ${y}px) scale(${factor})`;
      };
      scaleStage();
      window.addEventListener("resize", scaleStage);
    }

    showSlide(index, updateHash = true) {
      const next = Math.max(0, Math.min(index, slides.length - 1));
      this.currentSlide = next;

      slides.forEach((slide, i) => {
        const active = i === next;
        slide.classList.toggle("active", active);
        slide.classList.toggle("visible", active);
        slide.setAttribute("aria-hidden", active ? "false" : "true");
      });

      const number = String(next + 1).padStart(2, "0");
      const total = String(slides.length).padStart(2, "0");
      const name = slides[next].dataset.slideTitle || `Slide ${number}`;
      if (counter) counter.textContent = `${number} / ${total}`;
      if (progress) progress.style.width = `${((next + 1) / slides.length) * 100}%`;
      if (slideName) slideName.textContent = name;
      document.title = embedMode ? "Meikku — Product experience" : `Meikku — ${name}`;

      window.dispatchEvent(new CustomEvent("meikku:slide-change", {
        detail: { index: next, number: next + 1, title: name },
      }));

      if (updateHash && !embedMode) {
        try {
          history.replaceState(null, "", `#slide=${next + 1}`);
        } catch (error) {
          window.location.hash = `slide=${next + 1}`;
        }
      }
    }

    next() { this.showSlide(this.currentSlide + 1); }
    previous() { this.showSlide(this.currentSlide - 1); }

    setupKeyboardNav() {
      document.addEventListener("keydown", event => {
        const target = event.target;
        const isTextInput = target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target?.getAttribute?.("contenteditable") === "true";
        if (isTextInput) return;

        if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
          event.preventDefault();
          this.next();
        } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
          event.preventDefault();
          this.previous();
        } else if (event.key === "Home") {
          event.preventDefault();
          this.showSlide(0);
        } else if (event.key === "End") {
          event.preventDefault();
          this.showSlide(slides.length - 1);
        } else if ((event.key === "r" || event.key === "R") && this.currentSlide === 0) {
          window.location.reload();
        } else if (event.key === "e" || event.key === "E") {
          this.toggleEditMode();
        }
      });
    }

    setupWheelNav() {
      window.addEventListener("wheel", event => {
        if (this.isEditing || this.wheelLocked || Math.abs(event.deltaY) < 24) return;
        if (event.target.closest?.(".chat-body, .memory-panel-body")) return;
        this.wheelLocked = true;
        event.deltaY > 0 ? this.next() : this.previous();
        window.setTimeout(() => { this.wheelLocked = false; }, 520);
      }, { passive: true });
    }

    setupTouchNav() {
      stage.addEventListener("touchstart", event => {
        if (event.touches.length !== 1) return;
        this.touchStart = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
        };
      }, { passive: true });

      stage.addEventListener("touchend", event => {
        if (!this.touchStart || event.changedTouches.length !== 1) return;
        const dx = event.changedTouches[0].clientX - this.touchStart.x;
        const dy = event.changedTouches[0].clientY - this.touchStart.y;
        this.touchStart = null;
        if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return;
        dx < 0 ? this.next() : this.previous();
      }, { passive: true });
    }

    setupHashNav() {
      window.addEventListener("hashchange", () => {
        this.showSlide(this.readHash(), false);
      });
    }

    restoreEdits() {
      editableNodes.forEach(node => {
        const key = node.dataset.editKey;
        if (!key) return;
        let saved = null;
        try { saved = window.localStorage.getItem(`meikku-deck:${key}`); }
        catch (error) { saved = null; }
        if (saved !== null) node.innerHTML = saved;
      });
    }

    setupEditing() {
      editableNodes.forEach(node => {
        node.addEventListener("input", () => {
          const key = node.dataset.editKey;
          if (!key) return;
          try { window.localStorage.setItem(`meikku-deck:${key}`, node.innerHTML); }
          catch (error) { /* file:// storage can be unavailable; editing still works in-session */ }
        });
      });

      if (!editToggle || !editHotzone) return;
      editToggle.addEventListener("click", () => this.toggleEditMode());
      editHotzone.addEventListener("click", () => this.toggleEditMode());

      editHotzone.addEventListener("mouseenter", () => {
        window.clearTimeout(this.hideEditTimer);
        editToggle.classList.add("show");
      });
      editHotzone.addEventListener("mouseleave", () => this.scheduleEditHide());
      editToggle.addEventListener("mouseenter", () => window.clearTimeout(this.hideEditTimer));
      editToggle.addEventListener("mouseleave", () => this.scheduleEditHide());
    }

    scheduleEditHide() {
      window.clearTimeout(this.hideEditTimer);
      this.hideEditTimer = window.setTimeout(() => {
        if (!this.isEditing) editToggle?.classList.remove("show");
      }, 400);
    }

    toggleEditMode() {
      this.isEditing = !this.isEditing;
      editableNodes.forEach(node => {
        node.setAttribute("contenteditable", this.isEditing ? "true" : "false");
      });
      editToggle?.classList.toggle("active", this.isEditing);
      editToggle?.classList.toggle("show", this.isEditing);
      if (editToggle) editToggle.textContent = this.isEditing ? "DONE" : "EDIT";
    }
  }

  window.MeikkuDeck = new DeckPresentation();

  /* When the product replay completes, reveal that replay is available via R;
     completion does not auto-advance the marketing story. */
  window.addEventListener("meikku:opening-complete", () => {
    document.body.classList.add("opening-complete");
  });
})();
