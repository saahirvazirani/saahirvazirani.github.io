(() => {
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scene = document.querySelector(".signal-scene");
  const canvas = scene?.querySelector("canvas");
  const context = canvas?.getContext("2d");

  // A projected toroidal field: interconnected paths, not a scientific data plot.
  if (context) {
    const button = scene.querySelector(".motion-toggle");
    let paused = motionPreference.matches;
    let visible = false;
    let frame = 0;
    let lastTime = 0;
    let phase = 0;
    let width = 0;
    let height = 0;
    let pointer = { x: 0, y: 0 };
    let easedPointer = { x: 0, y: 0 };

    function draw() {
      context.clearRect(0, 0, width, height);
      const scale = Math.min(width, height) * 0.285;
      const tilt = 0.85 + easedPointer.y * 0.18;
      const rotation = -0.5 + easedPointer.x * 0.18;
      for (let ring = 0; ring < 64; ring++) {
        const u = ring / 64 * Math.PI * 2;
        const depth = (Math.sin(u + phase * 0.16) + 1) / 2;
        context.strokeStyle = `rgba(${45 + depth * 70}, ${100 + depth * 60}, 255, ${0.22 + depth * 0.6})`;
        context.lineWidth = ring % 8 === 0 ? 1.3 : 0.7;
        context.beginPath();
        for (let step = 0; step <= 100; step++) {
          const v = step / 100 * Math.PI * 2;
          const twist = u + 0.32 * Math.sin(v * 3 + phase);
          const radius = 1 + 0.34 * Math.cos(v);
          const x = radius * Math.cos(twist);
          const y = radius * Math.sin(twist);
          const z = 0.55 * Math.sin(v);
          const projectedY = y * Math.cos(tilt) - z * Math.sin(tilt);
          const px = (x * Math.cos(rotation) - projectedY * Math.sin(rotation)) * scale + width / 2;
          const py = (x * Math.sin(rotation) + projectedY * Math.cos(rotation)) * scale + height / 2;
          if (step === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.stroke();
      }
    }

    function tick(time) {
      frame = 0;
      if (paused || !visible || document.hidden) return;
      // Cap rendering at roughly 30 fps and avoid jumps after returning to the tab.
      if (time - lastTime >= 32) {
        phase += Math.min(time - lastTime, 50) * 0.00025;
        lastTime = time;
        easedPointer.x += (pointer.x - easedPointer.x) * 0.06;
        easedPointer.y += (pointer.y - easedPointer.y) * 0.06;
        draw();
      }
      frame = requestAnimationFrame(tick);
    }

    function sync() {
      cancelAnimationFrame(frame);
      frame = 0;
      button.textContent = paused ? "Play animation" : "Pause animation";
      if (!paused && visible && !document.hidden) {
        lastTime = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }

    function resize() {
      width = scene.clientWidth;
      height = scene.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
      scene.classList.add("is-ready");
    }

    button.hidden = false;
    button.addEventListener("click", () => { paused = !paused; sync(); });
    motionPreference.addEventListener("change", event => {
      paused = event.matches;
      pointer = { x: 0, y: 0 };
      easedPointer = { x: 0, y: 0 };
      draw();
      sync();
    });
    scene.addEventListener("pointermove", event => {
      if (event.pointerType !== "mouse" || paused) return;
      const bounds = scene.getBoundingClientRect();
      pointer = { x: (event.clientX - bounds.left) / width - 0.5, y: (event.clientY - bounds.top) / height - 0.5 };
    });
    scene.addEventListener("pointerleave", () => { pointer = { x: 0, y: 0 }; });
    document.addEventListener("visibilitychange", sync);
    new ResizeObserver(resize).observe(scene);
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }).observe(scene);
    resize();
    sync();
  }

  const navLinks = [...document.querySelectorAll('nav a[href^="#"]')];
  const destinations = navLinks.map(link => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  if (destinations.length) {
    const visibleSections = new Set();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) visibleSections.add(entry.target);
        else visibleSections.delete(entry.target);
      });
      const current = destinations.find(section => visibleSections.has(section));
      navLinks.forEach(link => {
        if (current && link.hash === `#${current.id}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-15% 0px -55% 0px" });
    destinations.forEach(section => observer.observe(section));
  }
})();
