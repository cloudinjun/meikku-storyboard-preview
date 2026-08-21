(() => {
  "use strict";

  const D = window.D1_DECK_EVIDENCE;
  if (!D || !Array.isArray(D.beats)) {
    document.body.textContent = "D1 data missing.";
    return;
  }
  const requestedStartEvent = new URLSearchParams(window.location.search).get("startEvent");

  // ── DOM refs ──
  const chatBody = document.getElementById("chatBody");
  const memoryPanel = document.getElementById("memoryPanel");
  const memoryClose = document.getElementById("memoryClose");
  const memoryPanelBody = document.getElementById("memoryPanelBody");
  const controlPanelBody = document.getElementById("controlPanelBody");
  const sheetScrim = document.getElementById("sheetScrim");
  const memoryBtn = document.getElementById("memoryBtn");
  const memoryBadge = document.getElementById("memoryBadge");
  const sheetTitle = document.getElementById("sheetTitle");

  // Workspace refs
  const clayShape = document.getElementById("clayShape");
  const armUpper = document.getElementById("armUpper");
  const armLower = document.getElementById("armLower");
  const armBase = document.getElementById("armBase");
  const armElbow = document.getElementById("armElbow");
  const armTcp = document.getElementById("armTcp");
  const armDir = document.getElementById("armDir");
  const attentionMarker = document.getElementById("attentionMarker");
  // CV 叠层
  const wsPlate = document.getElementById("wsPlate");
  const basePlate = document.getElementById("basePlate");
  const cvMeasure = document.getElementById("cvMeasure");
  const cvContour = document.getElementById("cvContour");
  const cvAction = document.getElementById("cvAction");
  // 在这里取，不要放到下面的实时相机块里：那块一加载就开始轮询，
  // 引用一个还没初始化的 const 会踩 TDZ。
  const cvOverlay = document.getElementById("cvOverlay");
  const cvLive = document.getElementById("cvLive");
  const wsPhase = document.getElementById("wsPhase");
  const wsClayLabel = document.getElementById("wsClayLabel");
  const wsPoseLabel = document.getElementById("wsPoseLabel");
  const wsChapter = document.getElementById("wsChapter");
  const wsBeat = document.getElementById("wsBeat");
  const wsCaption = document.getElementById("wsCaption");

  // ── Memory lookup ──
  const memoryCards = new Map();
  (D.memory_cards || []).forEach(c => memoryCards.set(c.memory_id, c));

  // ── Collect unique messages in order ──
  const messageQueue = [];
  const seenIds = new Set();

  D.beats.forEach(beat => {
    const cw = beat.conversation_window || [];
    cw.forEach(item => {
      if (seenIds.has(item.event_id)) return;
      seenIds.add(item.event_id);
      messageQueue.push({ type: "message", item, beat });
    });

    const ev = beat.event;
    if (ev.event_type === "try" && !seenIds.has(ev.event_id + "_action")) {
      seenIds.add(ev.event_id + "_action");
      messageQueue.push({ type: "action", event: ev, beat });
    }
  });

  // ── Create all DOM elements (hidden) ──
  // 流里只保留「谁说了什么」一种卡片；AI 的内部动作（回忆、尝试、记忆更新）
  // 一律压成一行 .process-row 摘要，细节点开才显示。
  let processSeq = 0;

  function makeProcessRow(summary, opts) {
    const o = opts || {};
    const row = document.createElement("button");
    row.className = "process-row" + (o.staticRow ? " is-static" : "") + (o.memoryEvent ? " memory-event" : "");
    row.type = "button";
    if (!o.staticRow) row.setAttribute("aria-expanded", "false");
    row.innerHTML = (o.staticRow || o.memoryEvent ? "" : '<span class="process-chevron"></span>') +
      '<span class="process-summary">' + escapeHtml(summary) + "</span>";
    return row;
  }

  // ═══════════════════════════════════════════════════════════════
  // UI 消息模型 —— 渲染层只认这个形状，与 fixture 无关。
  //
  //   message { id, role:"you"|"meikku"|"material", text,
  //             status?:"sending"|"sent"|"failed" }
  //   note    { id, kind:"recall"|"try", summary,
  //             detail?, source?:"you"|"inferred" }
  //
  // fixture 与后端各写一个 adapter 转成这个形状即可。
  // ═══════════════════════════════════════════════════════════════
  const ROLE_CLASS = { you: "human", meikku: "robot", material: "material" };
  const SOURCE_TEXT = { you: "You said", inferred: "I inferred" };
  const byId = new Map();          // message id -> 元素

  function renderMessage(msg) {
    const row = document.createElement("div");
    row.className = "message-row " + (ROLE_CLASS[msg.role] || "robot");
    row.dataset.id = msg.id;
    if (msg.status) row.dataset.status = msg.status;
    row.innerHTML =
      '<div class="bubble">' + escapeHtml(msg.text) + "</div>" +
      (msg.role === "you" ? '<div class="msg-status" aria-live="polite"></div>' : "");
    chatBody.appendChild(row);
    byId.set(msg.id, row);
    paintStatus(row);
    return row;
  }

  function paintStatus(row) {
    const el = row.querySelector(".msg-status");
    if (!el) return;
    const st = row.dataset.status;
    el.textContent = st === "sending" ? "Sending…"
      : st === "failed" ? "Not sent · Tap to retry" : "";
    row.classList.toggle("is-failed", st === "failed");
    row.classList.toggle("is-sending", st === "sending");
  }

  let noteSeq = 0;
  function renderNote(note) {
    const expandable = !!note.detail;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "process-row" + (expandable ? "" : " is-static");
    row.dataset.id = note.id;
    if (expandable) row.setAttribute("aria-expanded", "false");
    row.innerHTML = (expandable ? '<span class="process-chevron"></span>' : "") +
      '<span class="process-summary">' + escapeHtml(note.summary) + "</span>";
    chatBody.appendChild(row);

    if (expandable) {
      const id = "note-" + (noteSeq++);
      row.dataset.detail = id;
      const d = document.createElement("div");
      d.className = "process-detail";
      d.id = id;
      d.innerHTML =
        (note.source
          ? '<div class="detail-meta"><span class="provenance-pill ' +
            (note.source === "you" ? "user-said" : "inferred") + '">' +
            SOURCE_TEXT[note.source] + "</span></div>"
          : "") +
        escapeHtml(note.detail) +
        '<button class="detail-open-btn" data-open-memory="1">Open memory</button>';
      chatBody.appendChild(d);
    }
    return row;
  }

  // ── 滚动锚定：只有用户已经贴在底部时才自动跟随 ──
  function pinnedToBottom() {
    return chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 48;
  }
  function follow(el, wasPinned) {
    if (!wasPinned) { showJumpToLatest(true); return; }
    el.scrollIntoView({ behavior: "smooth", block: "end" });
  }
  const jumpBtn = document.getElementById("jumpLatest");
  function showJumpToLatest(on) { if (jumpBtn) jumpBtn.hidden = !on; }
  if (jumpBtn) {
    jumpBtn.addEventListener("click", () => {
      chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
      showJumpToLatest(false);
    });
    chatBody.addEventListener("scroll", () => { if (pinnedToBottom()) showJumpToLatest(false); });
  }

  function reveal(el) {
    const wasPinned = pinnedToBottom();
    el.style.display = el.classList.contains("message-row") ? "flex"
      : el.classList.contains("process-row") ? "flex" : "block";
    void el.offsetHeight;
    el.classList.add("visible");
    follow(el, wasPinned);
    setEmpty(false);
  }

  function setEmpty(on) { chatBody.classList.toggle("is-empty", on); }
  setEmpty(true);

  // 过程行交互：可展开的就地展开，记忆事件行直接开面板
  chatBody.addEventListener("click", e => {
    const openBtn = e.target.closest("[data-open-memory]");
    if (openBtn) { openSheet("memory"); return; }
    const row = e.target.closest(".process-row");
    if (!row || !row.dataset.detail) return;
    const detail = document.getElementById(row.dataset.detail);
    const open = row.getAttribute("aria-expanded") === "true";
    row.setAttribute("aria-expanded", open ? "false" : "true");
    detail.classList.toggle("open", !open);
  });

  // ── Input bar refs ──
  const inputField = document.getElementById("inputField");
  const inputTypingText = document.getElementById("inputTypingText");
  const sendBtn = document.querySelector(".send-btn");

  // ── Typing indicator (AI thinking dots + 语义化思考文案) ──
  const typingIndicator = document.createElement("div");
  typingIndicator.className = "typing-indicator";
  typingIndicator.innerHTML =
    '<div class="typing-dots">' +
      '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>' +
    '</div>' +
    '<div class="thinking-label" id="thinkingLabel"></div>';
  chatBody.appendChild(typingIndicator);
  const thinkingLabel = typingIndicator.querySelector("#thinkingLabel");

  // ── Animation helpers ──
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Two-step reveal: display first, then animate opacity in next frame
  function revealElement(el, extra) {
    el.style.display = el.classList.contains("message-row") ? "flex"
      : el.classList.contains("process-row") ? "flex"
      : "block";
    if (extra) {
      extra.style.display = "flex";
      void extra.offsetHeight;
      extra.classList.add("visible");
    }
    // Force reflow so transition fires
    void el.offsetHeight;
    el.classList.add("visible");
    el.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  function typeIntoInput(text) {
    return new Promise(resolve => {
      inputField.classList.add("has-text");
      inputTypingText.textContent = "";
      // Add blinking cursor
      const cursor = document.createElement("span");
      cursor.className = "input-typing-cursor";
      inputField.appendChild(cursor);

      let i = 0;
      const charInterval = Math.max(35, Math.min(65, 1200 / text.length)); // adaptive speed
      function typeChar() {
        if (i < text.length) {
          inputTypingText.textContent = text.substring(0, i + 1);
          i++;
          setTimeout(typeChar, charInterval + (Math.random() * 30 - 15));
        } else {
          // Done typing — brief pause then "send"
          setTimeout(() => {
            // Flash send button
            sendBtn.classList.add("flash");
            setTimeout(() => sendBtn.classList.remove("flash"), 150);
            // Clear input
            setTimeout(() => {
              inputTypingText.textContent = "";
              inputField.classList.remove("has-text");
              cursor.remove();
              resolve();
            }, 200);
          }, 300);
        }
      }
      typeChar();
    });
  }

  const meikkuFace = document.getElementById("meikkuFace");

  function showTypingIndicator(beat) {
    if (meikkuFace) meikkuFace.classList.add("is-thinking");
    // 左侧思考文案与右侧 workspace caption 同源，保证两栏严格对应
    thinkingLabel.textContent = beat ? getThinkingCaption(beat) : "";
    // Always move to end of chat so it appears after latest message
    chatBody.appendChild(typingIndicator);
    typingIndicator.classList.add("visible");
    typingIndicator.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  function hideTypingIndicator() {
    if (meikkuFace) meikkuFace.classList.remove("is-thinking");
    typingIndicator.classList.remove("visible");
  }

  function getActorType(entry) {
    if (entry.type === "action") return "robot";
    if (entry.type === "message") {
      if (entry.item.is_memory_recall) return "robot"; // AI recalling
      return entry.item.actor || "robot";
    }
    return "robot";
  }

  function getMessageText(entry) {
    if (entry.type === "action") return "";
    if (entry.type === "message") return entry.item.text || "";
    return "";
  }

  // ── Main sequencer ──
  let currentIndex = -1;
  let currentBeat = null;
  let manualArm = false;   // 人是否已从脚本手里接管机械臂

  function entryEventId(entry) {
    return entry.type === "action" ? entry.event?.event_id : entry.item?.event_id;
  }

  function showPrimed(el) {
    el.style.display = el.classList.contains("message-row") ? "flex"
      : el.classList.contains("process-row") ? "flex" : "block";
    el.classList.add("visible");
  }

  // fixture entry → UI 模型，然后走和后端完全相同的渲染路径
  function materialize(entry) {
    if (entry.type === "action") {
      const intent = entry.event.payload?.qualitative_intent || "acting";
      return renderNote({ id: entry.event.event_id + "_try", kind: "try",
        summary: "One small try: " + formatIntent(intent) });
    }
    const it = entry.item;
    if (it.is_memory_recall) {
      return renderNote({ id: it.event_id, kind: "recall",
        summary: "Remembered something from last time",
        detail: it.text,
        source: it.provenance === "ai_inferred" ? "inferred" : "you" });
    }
    return renderMessage({
      id: it.event_id,
      role: it.actor === "human" ? "you" : it.actor === "robot" ? "meikku" : "material",
      text: it.text,
    });
  }

  // Optional deck-only seek: build earlier beats as already-existing history,
  // then let the requested event and everything after it animate normally.
  // The standalone D1 page has no startEvent, so its full replay is unchanged.
  function primeReplayBefore(eventId) {
    const targetIndex = messageQueue.findIndex(entry => entryEventId(entry) === eventId);
    if (targetIndex <= 0) return false;

    for (let i = 0; i < targetIndex; i++) showPrimed(materialize(messageQueue[i]));

    const previousBeat = messageQueue[targetIndex - 1].beat;
    commitWorkspace(previousBeat);
    finalizeWorkspace(previousBeat);
    wsBeat.textContent = String(previousBeat.index + 1).padStart(2, "0") + " / 14";
    currentIndex = targetIndex - 1;
    setEmpty(false);
    chatBody.scrollTop = chatBody.scrollHeight;
    return true;
  }

  async function showNext() {
    currentIndex++;
    if (currentIndex >= messageQueue.length) return;
    const entry = messageQueue[currentIndex];
    const beat = entry.beat;
    const actor = getActorType(entry);
    const text = getMessageText(entry);

    if (actor === "human" && text) {
      await typeIntoInput(text);
      await sleep(150);
      reveal(materialize(entry));
      commitWorkspace(beat);
      finalizeWorkspace(beat);
      await sleep(600);
    } else if (actor === "robot" || actor === "material") {
      showTypingIndicator(beat);
      beginThinking(beat);
      const thinkTime = Math.min(2200, Math.max(1000, text.length * 14));
      await sleep(thinkTime * 0.6);
      commitWorkspace(beat);
      await sleep(thinkTime * 0.4);
      hideTypingIndicator();
      await sleep(100);
      reveal(materialize(entry));
      finalizeWorkspace(beat);
      await afterReveal(entry);
      await sleep(800);
    } else {
      beginThinking(beat);
      await sleep(400);
      commitWorkspace(beat);
      reveal(materialize(entry));
      finalizeWorkspace(beat);
      await sleep(1200);
    }

    if (currentIndex < messageQueue.length - 1) showNext();
  }

  // ── Workspace animation: 3-phase system ──
  // Phase 1: AI starts thinking — attention scans, phase = REASONING, caption hints
  function beginThinking(beat) {
    const frame = beat.canonical_frame;

    // Phase badge → REASONING (pulsing)
    setPhase("REASONING", "reasoning");
    wsPhase.classList.add("thinking");

    // Attention marker activates early — AI is "looking" at the workspace
    if (frame && frame.attention_anchors?.length > 0) {
      const anchor = frame.attention_anchors.find(a => a.status === "active");
      if (anchor?.resolved_referent?.point) {
        const px = anchor.resolved_referent.point.x * 100;
        const py = anchor.resolved_referent.point.y * 100;
        attentionMarker.setAttribute("transform", "translate(" + px + "," + py + ")");
        attentionMarker.setAttribute("opacity", "1");
        attentionMarker.classList.add("scanning");
      }
    }

    // Caption shows what AI is processing
    wsCaption.textContent = getThinkingCaption(beat);

    // Beat counter updates
    wsBeat.textContent = String(beat.index + 1).padStart(2, "0") + " / 14";
  }

  // Phase 2: Commit — clay morphs, arm moves to target (CSS transitions animate)
  function commitWorkspace(beat) {
    // 记录当前 beat，供 Control 面板标出正在执行的手势
    currentBeat = beat;
    // Clay shape morphs
    if (beat.clay?.path) {
      clayShape.setAttribute("d", beat.clay.path);
    }
    if (beat.clay?.label) wsClayLabel.textContent = beat.clay.label;

    // 底图与 CV 叠层跟着这一拍走
    updatePlate(beat);
    updateCV(beat);

    // Robot arm moves to target pose —— 人接管期间不覆盖机械臂
    if (!manualArm) {
      applyPose(beat);
      wsPoseLabel.textContent = (beat.robot_pose || "idle").replace(/_/g, " ").toUpperCase();
    }

    // Phase → PROCESSING（机械臂在执行，属于物质世界）
    setPhase("PROCESSING", "material");
  }

  // phase 徽章：JS 只切角色类，颜色由 styles.css 决定
  const PHASE_ROLE = {
    GROUNDING:  "cognition",   // AI 在理解人的输入
    RESPONDING: "cognition",   // AI 在组织回应
    REASONING:  "reasoning",   // 尚未落定的中间态
    PROCESSING: "material",    // 机械臂在执行
    TRYING:     "material",    // 机械臂在试
    OBSERVING:  "material",    // 在观察材料变化
    YIELDING:   "yield",       // 把回合交还给人
  };
  const ROLE_CLASSES = ["role-cognition", "role-reasoning", "role-material", "role-conflict", "role-yield"];

  function setPhase(text, role) {
    wsPhase.textContent = text;
    ROLE_CLASSES.forEach(c => wsPhase.classList.remove(c));
    wsPhase.classList.add("role-" + role);
  }

  // 把关节点写进 SVG（脚本回放和手动操控共用）
  function setArm(bx, by, ex, ey, tx, ty) {
    armBase.setAttribute("cx", bx);
    armBase.setAttribute("cy", by);
    armElbow.setAttribute("cx", ex);
    armElbow.setAttribute("cy", ey);
    armTcp.setAttribute("cx", tx);
    armTcp.setAttribute("cy", ty);

    armUpper.setAttribute("x1", bx);
    armUpper.setAttribute("y1", by);
    armUpper.setAttribute("x2", ex);
    armUpper.setAttribute("y2", ey);

    armLower.setAttribute("x1", ex);
    armLower.setAttribute("y1", ey);
    armLower.setAttribute("x2", tx);
    armLower.setAttribute("y2", ty);

    const angle = Math.atan2(ty - ey, tx - ex) * 180 / Math.PI;
    armDir.setAttribute("transform", "translate(" + tx + "," + ty + ") rotate(" + angle + ")");
  }

  function applyPose(beat) {
    const pose = beat && beat.robot_pose_points;
    if (!pose) return;
    setArm(pose.base[0], pose.base[1], pose.elbow[0], pose.elbow[1], pose.tcp[0], pose.tcp[1]);
  }

  // ═══ 预渲染底图 ═══
  // 约定：把渲染帧放在本目录的 plates/ 下，按 beat 命名 beat_01.png … beat_14.png
  // 文件存在即自动启用并隐藏 SVG 兜底底图；缺失则静默回落，不报错。
  const PLATE_DIR = "plates/";
  const PLATE_EXT = ".png";
  // 只探测第一帧。缺失就整套关掉，避免每次加载刷 14 个 404 到控制台。
  let platesAvailable = null;   // null=未探测 / false=无素材 / true=可用

  function plateSrcFor(beat) {
    return PLATE_DIR + "beat_" + String(beat.index + 1).padStart(2, "0") + PLATE_EXT;
  }

  function updatePlate(beat) {
    // 实时相机优先。连探测都不做，省掉一次必然 404 的 plates/ 请求。
    if (liveCam.active) return;
    if (platesAvailable === false) return;
    if (platesAvailable === true) { showPlate(plateSrcFor(beat)); return; }
    if (platesAvailable === null) {
      platesAvailable = "probing";
      const probe = new Image();
      probe.onload = () => { platesAvailable = true; if (currentBeat && !liveCam.active) showPlate(plateSrcFor(currentBeat)); };
      probe.onerror = () => { platesAvailable = false; };
      probe.src = PLATE_DIR + "beat_01" + PLATE_EXT;
    }
  }

  function showPlate(src) {
    wsPlate.src = src;
    wsPlate.hidden = false;
    // 注意：SVG 元素没有 HTMLElement 的 hidden 属性，必须写 content attribute
    basePlate.setAttribute("hidden", "");     // 有真画面就不再画兜底底图
  }

  // ═══ 实时相机底图 ═══
  // 帧总线是 robot/memory/camera_frames/，单写者是 robot/code/camera.py；
  // 感知服务把每一路镜像成 project/runtime/<role>_latest.jpg，
  // 而 9011 静态服务的根就是 project/，所以下面这个路径和本页同源，无需 CORS。
  //
  // 现在用 cam2：它是唯一做过地面标定的一路，第 3 步的真实叠层
  // （floorPolygonPx / image_point_px / centroidPx）都在它的像素坐标系里。
  // RealSense 进总线之后，把 LIVE_ROLE 换成它的角色名即可，其余不用动。
  // 路径写成相对的，不要写根绝对路径 /runtime/…：
  // 用 file:// 直接打开本页时，/runtime/… 会被解析成盘符根目录下的 /runtime/，
  // 必然取不到。../../ 从 UI/d1_deck_evidence_slice/ 退回 project/，
  // 在 file:// 和 http://…:9011/ 下都指向同一个 project/runtime/。
  const RUNTIME_DIR = "../../runtime/";

  // ── 底图来源。改这一个常量就能切换 ──
  //   "blender" —— Blender 里 Camera_A 的冻结渲染（透明底，640×480）。
  //                这是演示用的默认：几何在已知坐标系里，叠层由几何投影算出，
  //                精确套住黏土，不经过背景相减，不会有鬼影。
  //                重渲一次：跑 tools 里的 opengl 渲染，或让我再发一次。
  //   "camera"  —— cam2 的实时帧。看现场用，但叠层依赖背景相减，
  //                背景过期时会画错位置。
  //   "frozen"  —— 冻结素材，本目录 frozen/ 下，演示默认。
  //                网点已经烤进图里，运行时只是一张 <img>，不碰 canvas，
  //                所以 file:// 双击打开也能用（file:// 页面把 file:// 的图
  //                画进 canvas 会污染它，getImageData 直接抛异常）。
  //                叠层由 frozen/workspace_overlay.js 用 <script> 带进来，
  //                不用 fetch —— 浏览器同样禁止 file:// 页面发 fetch。
  //                重新冻结：在 Blender 里重渲 + 重投影，覆盖 frozen/ 那两个文件。
  const PLATE_SOURCE = "frozen";
  const PLATE_SRC = {
    // interval = 0 表示只取一次，不轮询
    frozen: { url: "frozen/workspace_plate.png", interval: 0 },
    blender: { url: RUNTIME_DIR + "blender_view.png", interval: 3000 },
    camera: { url: RUNTIME_DIR + "cam2_latest.jpg", interval: 200 },
  }[PLATE_SOURCE];
  const LIVE_SRC = PLATE_SRC.url;
  // 缓存戳只在 http 下加。file:// 的本地文件加载器对查询串的处理不可靠，
  // 带上 ?t=… 可能整张图都取不到；本地文件也没有 HTTP 缓存要绕。
  const IS_FILE = location.protocol === "file:";
  const bust = () => (IS_FILE ? "" : "?t=" + Date.now());
  // 相机源按帧总线的 5fps 拉；Blender 是冻结的一张，慢慢轮询即可，
  // 重渲之后不用刷新页面就会自己换上。
  const LIVE_INTERVAL_MS = PLATE_SRC.interval;
  const liveCam = { active: false, timer: null, failures: 0 };

  const wsError = document.getElementById("wsError");
  const wsErrorDetail = document.getElementById("wsErrorDetail");
  const wsNotice = document.getElementById("wsNotice");

  // ── 错误态 ──
  // 取不到相机画面时不再退回脚本回放的兜底底图：在真照片的位置上播假动画，
  // 会让人误以为看到的是实况。宁可空着报错。
  function showCameraError(reason) {
    liveCam.active = false;
    wsPlate.hidden = true;
    basePlate.setAttribute("hidden", "");     // 兜底底图也不放回来
    cvOverlay.setAttribute("hidden", "");
    cvLive.setAttribute("hidden", "");
    wsNotice.hidden = true;
    wsErrorDetail.textContent = reason;
    wsError.hidden = false;
    console.error("[workspace] 取不到相机画面：" + reason + "  期望路径 " + LIVE_SRC);
  }
  function clearCameraError() {
    wsError.hidden = true;
  }

  const CAMERA_REASON = IS_FILE
    ? "本页是用 file:// 打开的，读不到 " + LIVE_SRC + "。改用 http://127.0.0.1:9011/UI/d1_deck_evidence_slice/ 打开；实时叠层也只在 http 下可用（浏览器禁止 file:// 页面发起 fetch）。"
    : "读不到 " + LIVE_SRC + "。确认 main.py 正在运行，且 camera.py 在往 robot/memory/camera_frames/ 写帧。";

  function pullLiveFrame() {
    const probe = new Image();
    probe.onload = () => {
      liveCam.failures = 0;
      if (!liveCam.active) {
        liveCam.active = true;
        clearCameraError();
        basePlate.setAttribute("hidden", "");
        // 实时数据源一旦可用，脚本回放那套 CV 图形必须立刻撤掉。
        // 它的坐标来自 fixture，和画面里的东西没有任何关系，
        // 留在真照片上就是在假装「我认出了这团黏土」。
        // 真实叠层能不能起来是另一回事：要么画真的，要么什么都不画。
        cvOverlay.setAttribute("hidden", "");
      }
      // 双缓冲换图：离屏 Image 加载完了再换上，避免半张图闪烁
      wsPlate.src = probe.src;
      wsPlate.hidden = false;
      // 有画面但还没有感知数据时，把这件事说出来，别让人以为叠层坏了
      wsNotice.hidden = !cvLive.hasAttribute("hidden");
      // interval 为 0 = 冻结素材，取到就不再轮询
      if (LIVE_INTERVAL_MS > 0) {
        liveCam.timer = setTimeout(pullLiveFrame, LIVE_INTERVAL_MS);
      }
    };
    probe.onerror = () => {
      liveCam.failures += 1;
      // 单次失败多半是读到了正在被 camera.py 重写的半张 jpg，快速重试即可。
      // 连续三次就报错，但保持慢轮询，后端恢复时画面会自己回来。
      if (liveCam.failures >= 3) showCameraError(CAMERA_REASON);
      const backoff = liveCam.failures >= 3 ? 5000 : LIVE_INTERVAL_MS * 4;
      liveCam.timer = setTimeout(pullLiveFrame, backoff);
    };
    probe.src = LIVE_SRC + bust();
  }
  pullLiveFrame();

  // ═══ 实时叠层：AI 对这张画面的理解 ═══
  // 数据来自感知服务写出的环境窗口，和本页同源。里面的像素坐标就是 cam2 的
  // 画幅坐标，而 #cvLive 的用户坐标系已经等于该画幅，所以直接写进去即可。
  // 同样用相对路径。但注意：叠层这一层用的是 fetch，而浏览器禁止 file:// 页面
  // 发起 fetch（跨源策略只允许 http/https/data）。所以用 file:// 打开时底图能出，
  // 真实叠层出不来，只能走 http://127.0.0.1:9011/UI/d1_deck_evidence_slice/。
  const LIVE_JSON = RUNTIME_DIR + "environment_window_latest.json";
  const LIVE_JSON_INTERVAL_MS = 2000;
  const SVGNS = "http://www.w3.org/2000/svg";

  const liveFloor = document.getElementById("liveFloor");
  const liveGrid = document.getElementById("liveGrid");
  const liveMaterial = document.getElementById("liveMaterial");
  const liveFeatures = document.getElementById("liveFeatures");
  const liveAction = document.getElementById("liveAction");
  const liveTip = document.getElementById("liveTip");

  let liveRevision = null;
  let liveJsonFailures = 0;

  const ptsAttr = (pts) => pts.map(p => p[0] + "," + p[1]).join(" ");

  // 按绕质心的角度排序，得到不自交的多边形。锚点的 left/right/top/bottom
  // 是工作面方位而不是图像方位，直接按名字连线会拧成蝴蝶结。
  function ringOrder(points) {
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
    return points.slice().sort((a, b) =>
      Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  }

  // 网格锚点：■ 方块。按到工作面原点角的距离排序，逐格点亮＝机器在逐格读工作面。
  function paintGrid(anchors, originPx) {
    const pts = anchors
      .filter(a => a.anchor_source === "static_grid" && a.image_point_px)
      .map(a => a.image_point_px);
    if (!pts.length) { liveGrid.replaceChildren(); return; }

    const ox = originPx ? originPx[0] : 0;
    const oy = originPx ? originPx[1] : 0;
    pts.sort((a, b) =>
      Math.hypot(a[0] - ox, a[1] - oy) - Math.hypot(b[0] - ox, b[1] - oy));

    const S = 4.6;                       // 方块边长，像素
    const frag = document.createDocumentFragment();
    const span = 620;                    // 整个扫描过程的时长，毫秒
    pts.forEach((p, i) => {
      const r = document.createElementNS(SVGNS, "rect");
      r.setAttribute("x", (p[0] - S / 2).toFixed(1));
      r.setAttribute("y", (p[1] - S / 2).toFixed(1));
      r.setAttribute("width", S);
      r.setAttribute("height", S);
      r.style.transitionDelay = Math.round(i / pts.length * span) + "ms";
      frag.appendChild(r);
    });
    liveGrid.replaceChildren(frag);
    // 下一轮任务里再加 .lit，否则元素刚插入就已是终态，transition 不会跑。
    // 这里用 setTimeout 而不是 requestAnimationFrame：标签页切到后台时 rAF
    // 会被冻结，网格就永远停在 opacity 0 上再也不亮。定时器只会被限频，还会执行。
    setTimeout(() => {
      liveGrid.querySelectorAll("rect").forEach(r => r.classList.add("lit"));
    }, 0);
  }

  // 材料：4 个边缘锚点连成边界，中心锚点单独标出
  function paintMaterial(anchors) {
    const feats = anchors.filter(a => a.anchor_source === "dynamic_material" && a.image_point_px);
    const edges = feats.filter(a => a.feature_role !== "center").map(a => a.image_point_px);
    liveMaterial.setAttribute("points", edges.length >= 3 ? ptsAttr(ringOrder(edges)) : "");

    const frag = document.createDocumentFragment();
    feats.forEach(a => {
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("cx", a.image_point_px[0].toFixed(1));
      c.setAttribute("cy", a.image_point_px[1].toFixed(1));
      const isCenter = a.feature_role === "center";
      c.setAttribute("r", isCenter ? 5.5 : 3.6);
      if (isCenter) c.classList.add("is-center");
      // 置信度写进 title，鼠标悬停可查，不占画面
      const t = document.createElementNS(SVGNS, "title");
      t.textContent = a.anchor_id + " · confidence " + (a.confidence ?? 0).toFixed(3);
      c.appendChild(t);
      frag.appendChild(c);
    });
    liveFeatures.replaceChildren(frag);
    return feats;
  }

  function paintLive(win) {
    const perception = win.perception || {};
    const reg = perception.registration || {};
    const anchors = win.anchors || perception.anchors || [];

    // 工作面四角
    const floor = reg.floorPolygonPx;
    liveFloor.setAttribute("points", Array.isArray(floor) && floor.length >= 3 ? ptsAttr(floor) : "");

    paintGrid(anchors, reg.originCornerPx);
    const feats = paintMaterial(anchors);

    // 刀尖
    const eev = perception.endEffectorVision || {};
    const tip = eev.centroidPx;
    if (Array.isArray(tip)) {
      liveTip.setAttribute("transform", "translate(" + tip[0] + "," + tip[1] + ")");
      liveTip.setAttribute("opacity", "1");
      liveTip.classList.remove("refreshed");
      void liveTip.offsetWidth;                 // 强制回流，让动画能重放
      liveTip.classList.add("refreshed");
    } else {
      liveTip.setAttribute("opacity", "0");
    }

    // 动作线：刀尖 → 选中的锚点（没有选中就指向材料中心）
    const selected = anchors.find(a => a.selected && a.image_point_px)
      || feats.find(a => a.feature_role === "center");
    if (Array.isArray(tip) && selected) {
      liveAction.setAttribute("x1", tip[0]);
      liveAction.setAttribute("y1", tip[1]);
      liveAction.setAttribute("x2", selected.image_point_px[0]);
      liveAction.setAttribute("y2", selected.image_point_px[1]);
      liveAction.removeAttribute("hidden");
    } else {
      liveAction.setAttribute("hidden", "");
    }

    // 真实叠层一上来，脚本回放的那套 CV 图形就退场，避免两套坐标打架
    cvLive.removeAttribute("hidden");
    cvOverlay.setAttribute("hidden", "");
  }

  // ═══ Blender 底图的叠层 ═══
  // blender_overlay.json 由 Blender 端把几何通过 Camera_A 投影得到，
  // 单位就是 blender_view.png 的像素，和 #cvLive 的用户坐标系一一对应。
  // 没有背景相减、没有阈值，位置是算出来的，不会漂。
  const BLENDER_OVERLAY = RUNTIME_DIR + "blender_overlay.json";
  let blenderStamp = null;

  function paintBlenderOverlay(o) {
    liveFloor.setAttribute("points",
      Array.isArray(o.floorPolygonPx) ? ptsAttr(o.floorPolygonPx) : "");

    // 网格：■ 方块，按到工作面原点的距离逐格点亮
    const grid = Array.isArray(o.gridPx) ? o.gridPx.slice() : [];
    const origin = (o.floorPolygonPx && o.floorPolygonPx[0]) || [0, 0];
    grid.sort((a, b) =>
      Math.hypot(a[0] - origin[0], a[1] - origin[1]) -
      Math.hypot(b[0] - origin[0], b[1] - origin[1]));
    const S = 4.6, frag = document.createDocumentFragment(), span = 620;
    grid.forEach((p, i) => {
      const rect = document.createElementNS(SVGNS, "rect");
      rect.setAttribute("x", (p[0] - S / 2).toFixed(1));
      rect.setAttribute("y", (p[1] - S / 2).toFixed(1));
      rect.setAttribute("width", S);
      rect.setAttribute("height", S);
      rect.style.transitionDelay = Math.round(i / Math.max(1, grid.length) * span) + "ms";
      frag.appendChild(rect);
    });
    liveGrid.replaceChildren(frag);
    setTimeout(() => {
      liveGrid.querySelectorAll("rect").forEach(rect => rect.classList.add("lit"));
    }, 0);

    // 黏土轮廓：投影得到的外形。仍用虚线 —— 这个体量是「正面测量 + 背面推断」，
    // 不是全测出来的（mesh 自己的 meshTruthStatus 就是这么写的）。
    liveMaterial.setAttribute("points",
      Array.isArray(o.clayOutlinePx) ? ptsAttr(o.clayOutlinePx) : "");

    // 黏土中心：● 圆点
    const feats = document.createDocumentFragment();
    if (Array.isArray(o.clayCentroidPx)) {
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("cx", o.clayCentroidPx[0]);
      c.setAttribute("cy", o.clayCentroidPx[1]);
      c.setAttribute("r", 5.5);
      c.classList.add("is-center");
      const t = document.createElementNS(SVGNS, "title");
      const prov = o.clayProvenance || {};
      t.textContent = "clay centroid · " + (prov.reconstructionRunId || "unknown run");
      c.appendChild(t);
      feats.appendChild(c);
    }
    liveFeatures.replaceChildren(feats);

    // 工具尖与动作线
    const tip = o.tipPx;
    if (Array.isArray(tip)) {
      liveTip.setAttribute("transform", "translate(" + tip[0] + "," + tip[1] + ")");
      liveTip.setAttribute("opacity", "1");
      liveTip.classList.remove("refreshed");
      void liveTip.offsetWidth;
      liveTip.classList.add("refreshed");
    } else {
      liveTip.setAttribute("opacity", "0");
    }
    if (Array.isArray(tip) && Array.isArray(o.clayCentroidPx)) {
      liveAction.setAttribute("x1", tip[0]);
      liveAction.setAttribute("y1", tip[1]);
      liveAction.setAttribute("x2", o.clayCentroidPx[0]);
      liveAction.setAttribute("y2", o.clayCentroidPx[1]);
      liveAction.removeAttribute("hidden");
    } else {
      liveAction.setAttribute("hidden", "");
    }

    cvLive.removeAttribute("hidden");
    cvOverlay.setAttribute("hidden", "");
    wsNotice.hidden = true;
  }

  async function pullBlenderOverlay() {
    // 冻结素材：数据由 frozen/workspace_overlay.js 用 <script> 带进来，
    // 直接画，不发 fetch —— 这样 file:// 双击打开也能出叠层。
    if (PLATE_SOURCE === "frozen") {
      const o = window.MEIKKU_FROZEN_OVERLAY;
      if (o) {
        if (o.generatedAt !== blenderStamp) {
          blenderStamp = o.generatedAt;
          paintBlenderOverlay(o);
        }
      } else {
        cvLive.setAttribute("hidden", "");
        cvOverlay.setAttribute("hidden", "");
        if (wsError.hidden) wsNotice.hidden = false;
        console.error("[workspace] frozen/workspace_overlay.js 没加载，" +
          "检查 index.html 里那行 <script> 是否在 deck_evidence_page.js 之前。");
      }
      return;                                   // 冻结数据不会变，不再轮询
    }
    try {
      const res = await fetch(BLENDER_OVERLAY + bust(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const o = await res.json();
      liveJsonFailures = 0;
      if (o.generatedAt !== blenderStamp) {
        blenderStamp = o.generatedAt;
        paintBlenderOverlay(o);
      }
    } catch (err) {
      liveJsonFailures += 1;
      if (liveJsonFailures === 3) {
        blenderStamp = null;
        cvLive.setAttribute("hidden", "");
        cvOverlay.setAttribute("hidden", "");   // 回放叠层同样不许画到真渲染上
        if (wsError.hidden) wsNotice.hidden = false;   // 没在报错时才提示缺数据
      }
    }
    setTimeout(pullLiveWindow,
      liveJsonFailures >= 3 ? 8000 : LIVE_JSON_INTERVAL_MS);
  }

  async function pullLiveWindow() {
    // environment_window 里的 floorPolygonPx / image_point_px / centroidPx
    // 全都是 cam2 的像素坐标。底图换成 Blender 的 Camera_A 之后这些坐标不再成立，
    // 画上去就是错位。Blender 底图的叠层走 blender_overlay.json（由几何投影得到）。
    if (PLATE_SOURCE !== "camera") { pullBlenderOverlay(); return; }
    try {
      const res = await fetch(LIVE_JSON + bust(), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const win = await res.json();
      liveJsonFailures = 0;
      // revision 没变就不重绘，省掉每 2 秒一次的 121 个节点重建
      if (win.revision !== liveRevision) {
        liveRevision = win.revision;
        paintLive(win);
      }
    } catch (err) {
      liveJsonFailures += 1;
      // 连续三次失败就把真实叠层收起来、把脚本回放的那套放回去，
      // 但继续慢轮询，后端恢复时叠层会自己回来。
      if (liveJsonFailures === 3) {
        liveRevision = null;                     // 清掉，恢复时强制重绘一次
        cvLive.setAttribute("hidden", "");
        cvOverlay.removeAttribute("hidden");
      }
    }
    setTimeout(pullLiveWindow,
      liveJsonFailures >= 3 ? 8000 : LIVE_JSON_INTERVAL_MS);
  }
  pullLiveWindow();

  // ═══ CV 分析叠层 ═══
  // 只保留两件回答得了 DNA §3「动作问题」的图形：
  //   cvContour —— 材料的边界被识别成什么样（What is happening to the material?）
  //   cvAction  —— 机械臂下一步要往哪去（Where is the robot about to act?）
  // 原先的材料填充/轮廓锚点/检测框/22 条激光射线均与这两者重复，已删除。
  function updateCV(beat) {
    const d = beat.clay && beat.clay.path;
    if (!d) return;

    cvMeasure.setAttribute("d", d);   // 无过渡，可立即测量
    cvContour.setAttribute("d", d);

    // 动作线：TCP → 当前注意力锚点。没有锚点就不画，不留装饰性残线。
    const pose = beat.robot_pose_points;
    const anchor = (beat.canonical_frame?.attention_anchors || [])
      .find(a => a.status === "active" && a.resolved_referent?.point);
    if (pose && anchor) {
      cvAction.setAttribute("x1", pose.tcp[0]);
      cvAction.setAttribute("y1", pose.tcp[1]);
      cvAction.setAttribute("x2", anchor.resolved_referent.point.x * 100);
      cvAction.setAttribute("y2", anchor.resolved_referent.point.y * 100);
      cvAction.removeAttribute("hidden");
    } else {
      cvAction.setAttribute("hidden", "");
    }
  }

  // Phase 3: Finalize — set real phase, real caption, stop scanning
  function finalizeWorkspace(beat) {
    const frame = beat.canonical_frame;

    // Stop scanning animation
    attentionMarker.classList.remove("scanning");
    wsPhase.classList.remove("thinking");

    // Set final attention state
    if (frame && frame.attention_status === "active" && frame.attention_anchors?.length > 0) {
      const anchor = frame.attention_anchors.find(a => a.status === "active");
      if (anchor?.resolved_referent?.point) {
        const px = anchor.resolved_referent.point.x * 100;
        const py = anchor.resolved_referent.point.y * 100;
        attentionMarker.setAttribute("transform", "translate(" + px + "," + py + ")");
        attentionMarker.setAttribute("opacity", "1");
      }
    } else {
      attentionMarker.setAttribute("opacity", "0");
    }

    // Final labels
    wsChapter.textContent = beat.chapter || "";
    wsCaption.textContent = beat.caption || "";

    // Final phase
    if (frame?.phase) {
      setPhase(frame.phase, PHASE_ROLE[frame.phase] || "cognition");
    }
  }

  // Generate contextual thinking captions
  function getThinkingCaption(beat) {
    const ev = beat.event;
    const phase = beat.canonical_frame?.phase;
    if (ev.event_type === "remember") return "Looking back at what we made together…";
    if (ev.event_type === "suggest") return "Considering what the clay could try next…";
    if (ev.event_type === "acknowledge") return "Making room for your correction…";
    if (ev.event_type === "try") return "Preparing one small, reversible try…";
    if (ev.event_type === "notice") return "Watching how the clay changed…";
    if (ev.event_type === "yield") return "Leaving the next choice with you…";
    if (phase === "GROUNDING") return "Making sure we mean the same place…";
    if (phase === "RESPONDING") return "Finding words for the next possibility…";
    if (phase === "TRYING") return "Shaping one small next move…";
    if (phase === "OBSERVING") return "Letting the material answer…";
    return "Thinking with the clay…";
  }

  // ── Initialize workspace with first beat ──
  if (D.beats.length > 0) {
    const b = D.beats[0];
    commitWorkspace(b);
    finalizeWorkspace(b);
  }

  // D1 is a standalone product UI / UX replay. Start when its sole demo slide
  // becomes active; the marketing narrative now lives in the storyboard deck.
  let replayStarted = false;
  function startReplay() {
    if (replayStarted) return;
    replayStarted = true;
    if (requestedStartEvent) primeReplayBefore(requestedStartEvent);
    setTimeout(showNext, 600);
  }

  window.addEventListener("meikku:slide-change", event => {
    if (event.detail?.index === 0) startReplay();
  });

  // 回放推进到「记忆被取代」那一拍时触发：
  // 主界面按产品标准保持克制，但演示需要把这个功能亮出来，
  // 所以自动展开一次记忆面板，停留后收起。手动点击照常可用。

  // 记忆被取代时：只翻状态、更新角标。
  // 不做任何提示 —— 被记得的感觉应该从 Meikku 说的话里长出来
  // （"The upper fold — I know this place." / "Your correction made a
  // difference…"），而不是再弹一条系统通知重复告知同一件事。
  // 想查改了什么，header 的记忆入口一直在那里。
  async function afterReveal(entry) {
    if (entry.type !== "message" || !entry.item?.is_memory_supersession) return;
    memoryUpdated = true;
    memoryBadge.textContent = String((D.memory_cards || []).length);
  }

  // ═══════════════════════════════════════════════════════════════
  // 对外契约
  //
  // UI → 外部（CustomEvent，冒泡到 document）
  //   meikku:send          { id, text }
  //   meikku:retry         { id }
  //   meikku:stop          {}
  //   meikku:voice         { durationMs, cancelled }
  //   meikku:attach        { kind }   camera|photos|reference|point|arm|scan|piece
  //   meikku:setting       { key, value }
  //   meikku:arm-takeover  { active, tcp:{x,y} }
  //   meikku:memory-edit   { id, text }
  //   meikku:memory-forget { id }
  //
  // 外部 → UI（window.MeikkuUI）
  //   appendMessage(msg) / appendNote(note) / updateMessage(id, patch)
  //   setTyping(on, label) / setMemory(list) / setConnection(state)
  //   setArm(pose) / setPhase(name) / setClay(pathD) / clear()
  // ═══════════════════════════════════════════════════════════════
  let externalMemory = null;

  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent("meikku:" + name, { detail: detail, bubbles: true }));
  }

  // ── 输入通道 ──
  const stopBtn = document.getElementById("stopBtn");
  const connBar = document.getElementById("connBar");
  let generating = false;
  let outSeq = 0;

  function inputText() {
    return (inputField.textContent || "").replace(/\u00a0/g, " ").trim();
  }
  function syncComposer() {
    const has = inputText().length > 0;
    inputField.classList.toggle("has-text", has);
    sendBtn.disabled = !has || generating;
  }
  function clearInput() {
    inputTypingText.textContent = "";
    inputField.textContent = "";
    syncComposer();
  }

  function submit() {
    const text = inputText();
    if (!text || generating) return;
    const id = "local-" + (++outSeq);
    reveal(renderMessage({ id: id, role: "you", text: text, status: "sending" }));
    clearInput();
    emit("send", { id: id, text: text });
  }

  inputField.addEventListener("input", syncComposer);
  inputField.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  // contenteditable 粘贴会带样式，强制纯文本
  inputField.addEventListener("paste", function (e) {
    e.preventDefault();
    const t = (e.clipboardData || window.clipboardData).getData("text");
    document.execCommand("insertText", false, t);
  });
  sendBtn.addEventListener("click", submit);
  stopBtn.addEventListener("click", function () { emit("stop", {}); setGenerating(false); });

  // 发送失败后点消息重试
  chatBody.addEventListener("click", function (e) {
    const row = e.target.closest(".message-row.is-failed");
    if (!row) return;
    row.dataset.status = "sending";
    paintStatus(row);
    emit("retry", { id: row.dataset.id });
  });
  syncComposer();

  function setGenerating(on) {
    generating = !!on;
    stopBtn.hidden = !generating;
    sendBtn.hidden = generating;
    syncComposer();
  }

  // ── 外部可调用的 API ──
  window.MeikkuUI = {
    appendMessage: function (msg) { const el = renderMessage(msg); reveal(el); return el; },
    appendNote: function (note) { const el = renderNote(note); reveal(el); return el; },
    updateMessage: function (id, patch) {
      const row = byId.get(id);
      if (!row) return false;
      if (patch.text) row.querySelector(".bubble").textContent = patch.text;
      if (patch.status) { row.dataset.status = patch.status; paintStatus(row); }
      if (patch.id && patch.id !== id) {
        byId.delete(id); row.dataset.id = patch.id; byId.set(patch.id, row);
      }
      return true;
    },
    setTyping: function (on, label) {
      setGenerating(on);
      if (on) {
        thinkingLabel.textContent = label || "";
        chatBody.appendChild(typingIndicator);
        typingIndicator.classList.add("visible");
        if (meikkuFace) meikkuFace.classList.add("is-thinking");
      } else {
        hideTypingIndicator();
      }
    },
    setMemory: function (list) {
      externalMemory = list;
      renderMemoryPanel();
      memoryBadge.textContent = String((list || []).length || 1);
    },
    setConnection: function (state) {
      connBar.hidden = state === "online";
      connBar.textContent = state === "offline" ? "No connection" : "Reconnecting…";
    },
    setArm: function (pose) {
      if (pose) setArm(pose.base[0], pose.base[1], pose.elbow[0], pose.elbow[1], pose.tcp[0], pose.tcp[1]);
    },
    setPhase: function (name) { setPhase(name, PHASE_ROLE[name] || "cognition"); },
    setClay: function (d) {
      if (!d) return;
      clayShape.setAttribute("d", d);
      cvMeasure.setAttribute("d", d);
      cvContour.setAttribute("d", d);
    },
    clear: function () {
      chatBody.querySelectorAll(".message-row, .process-row, .process-detail").forEach(function (n) { n.remove(); });
      byId.clear();
      setEmpty(true);
    }
  };

  // ── Bottom sheet：Memory / Control 共用一套面板 ──
  memoryBadge.textContent = "1";   // 更新前只有一条记忆；取代发生后变 2

  function openSheet(panel) {
    // 互斥集中在这里：任何一个面板打开，另外两个必须收起。
    // 之前只在 openAttach 里做了单向互斥，自动演示直接调 openSheet，
    // 结果记忆面板和附件 sheet 会同时出现在屏幕上。
    closeSettings();
    closeAttach();
    sheetTitle.textContent = panel === "memory" ? "Memory" : "Move the arm";
    memoryPanelBody.hidden = panel !== "memory";
    controlPanelBody.hidden = panel !== "control";
    if (panel === "memory") renderMemoryPanel();
    else updateControlPanel();
    memoryPanel.hidden = false;
    sheetScrim.hidden = false;
    memoryBtn.classList.toggle("open", panel === "memory");
  }

  function closeSheet() {
    releaseManual();   // 关面板即交还控制权，避免机械臂卡在人摆的姿态里
    memoryPanel.hidden = true;
    sheetScrim.hidden = true;
    memoryBtn.classList.remove("open");
  }

  // 记忆面板内的手动操作
  memoryPanelBody.addEventListener("click", e => {
    const card = e.target.closest(".memory-card");
    if (!card) return;
    if (e.target.closest("[data-mem-edit]")) {
      const box = card.querySelector(".mem-edit");
      box.hidden = !box.hidden;
      if (!box.hidden) {
        const f = box.querySelector(".mem-edit-field");
        f.textContent = card.querySelector(".memory-card-claim").textContent;
        f.focus();
      }
      return;
    }
    if (e.target.closest("[data-mem-forget]")) {
      const btn = e.target.closest("[data-mem-forget]");
      // 破坏性操作二次确认；这是脚本化回放，不真的改 fixture
      if (btn.dataset.armed === "1") { btn.dataset.armed = "0"; btn.textContent = "Forget";
        emit("memory-forget", { id: card.dataset.mem }); }
      else {
        btn.dataset.armed = "1"; btn.textContent = "Forget it?";
        setTimeout(() => { if (btn.dataset.armed === "1") { btn.dataset.armed = "0"; btn.textContent = "Forget"; } }, 3000);
      }
      return;
    }
    if (e.target.closest(".mem-edit-save")) {
      // 保存后卡片本身就显示新内容，那就是反馈，不需要再弹提示
      emit("memory-edit", { id: card.dataset.mem,
        text: card.querySelector(".mem-edit-field").textContent.trim() });
      card.querySelector(".mem-edit").hidden = true;
    }
  });

  memoryBtn.addEventListener("click", () => {
    if (!memoryPanel.hidden && !memoryPanelBody.hidden) closeSheet();
    else openSheet("memory");
  });
  memoryClose.addEventListener("click", closeSheet);
  sheetScrim.addEventListener("click", () => { closeSheet(); closeSettings(); closeAttach(); });

  // ═══ 记忆模型 ═══════════════════════════════════════════════
  // 面板只认下面这个形状。后端实现这一个对象即可，不需要理解 fixture。
  //
  //   {
  //     id:      string                    必填
  //     text:    string                    必填  记忆内容
  //     source:  "you" | "inferred"        必填  谁的来源
  //     status:  "active" | "replaced"     必填
  //     replaces?: string                  选填  被它取代的记忆 id
  //     why?: { kind?: string, quote?: string }   选填  为什么变了
  //   }
  //
  // 只有前四个是必填。缺 replaces → 不渲染「REPLACED」区；
  // 缺 why → 不渲染改动说明块。面板永远是这份数组的纯函数，
  // 不再去扫描聊天记录取引文。
  // ═══════════════════════════════════════════════════════════

  // fixture → 模型。后端接入时换掉这一个函数即可。
  function toMemoryModel(raw, beats) {
    // 触发引文只在 fixture 里要从对话反查；真实后端应直接写进 why.quote
    let quote = "", kind = "";
    for (const b of beats || []) {
      const hit = (b.conversation_window || []).find(i => i.is_memory_correction);
      if (hit && !quote) quote = hit.text;
      const mc = b.memory_correction || b.event?.payload?.memory_correction;
      if (mc?.correction_type && !kind) kind = mc.correction_type;
    }
    return (raw || []).map(c => ({
      id: c.memory_id,
      text: c.claim,
      source: c.provenance === "ai_inferred" ? "inferred" : "you",
      status: "active",
      replaces: c.supersedes || undefined,
      why: c.supersedes ? { kind, quote } : undefined,
    }));
  }

  const SOURCE_LABEL = { you: "You said", inferred: "I inferred" };

  function renderMemoryPanel() {
    memoryPanelBody.innerHTML = "";
    const all = externalMemory || toMemoryModel(D.memory_cards, D.beats);
    const replacer = all.find(m => m.replaces);
    // 回放到取代那一拍之前，只显示原始那条
    const current = (memoryUpdated && replacer) ? replacer : all.find(m => !m.replaces);
    const replaced = (memoryUpdated && replacer) ? all.find(m => m.id === replacer.replaces) : null;
    if (!current) return;

    const card = (m, dimmed, editable) =>
      '<div class="memory-card' + (dimmed ? " superseded" : "") + '" data-mem="' + escapeHtml(m.id) + '">' +
        '<div class="memory-card-header">' +
          '<span class="memory-card-source">' +
            escapeHtml(dimmed ? "Replaced" : (m.source === "you" ? "From you" : "Meikku inferred")) +
          "</span>" +
          '<span class="provenance-pill ' + (m.source === "you" ? "user-said" : "inferred") + '">' +
            escapeHtml(SOURCE_LABEL[m.source]) + "</span>" +
        "</div>" +
        '<div class="memory-card-claim">' + escapeHtml(m.text) + "</div>" +
        (editable
          ? '<div class="mem-actions">' +
              '<button class="mem-action" data-mem-edit="1">Correct this</button>' +
              '<button class="mem-action is-danger" data-mem-forget="1">Forget</button>' +
            "</div>" +
            '<div class="mem-edit" hidden>' +
              '<label class="mem-edit-label">What should it say instead?</label>' +
              '<div class="mem-edit-field" contenteditable="true" role="textbox" aria-label="Corrected memory"></div>' +
              '<button class="mem-edit-save">Save</button>' +
            "</div>"
          : "") +
      "</div>";

    let html = card(current, false, true);
    // why 缺失就不渲染这一块，后端不必凑数据
    if (replaced && current.why && (current.why.quote || current.why.kind)) {
      html += '<div class="memory-change">' +
        (current.why.kind ? '<div class="memory-change-kind">' + escapeHtml(formatIntent(current.why.kind)) + "</div>" : "") +
        (current.why.quote ? '<div class="memory-change-quote">' + escapeHtml(current.why.quote) + "</div>" : "") +
        "</div>";
    }
    if (replaced) {
      html += '<div class="mem-section-label">Replaced</div>' + card(replaced, true, false);
    }
    memoryPanelBody.innerHTML = html;
  }

  memoryBtn.addEventListener("click", () => {
    if (!memoryPanel.hidden && !memoryPanelBody.hidden) closeSheet();
    else openSheet("memory");
  });
  memoryClose.addEventListener("click", closeSheet);
  sheetScrim.addEventListener("click", () => { closeSheet(); closeSettings(); closeAttach(); });

  // 记忆是否已被更新（真实后端应由外部状态驱动，这里由回放推进）
  let memoryUpdated = false;

  // ═══ 设置面板 ═══
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsSheet = document.getElementById("settingsSheet");
  const settingsClose = document.getElementById("settingsClose");
  const setMemoryCount = document.getElementById("setMemoryCount");

  function openSettings() {
    closeSheet();
    closeAttach();
    setMemoryCount.textContent = memoryUpdated ? String((D.memory_cards || []).length) : "1";
    settingsSheet.hidden = false;
    sheetScrim.hidden = false;
    settingsBtn.classList.add("open");
  }
  function closeSettings() {
    settingsSheet.hidden = true;
    sheetScrim.hidden = true;
    settingsBtn.classList.remove("open");
  }
  settingsBtn.addEventListener("click", () => {
    if (settingsSheet.hidden) openSettings(); else closeSettings();
  });
  settingsClose.addEventListener("click", closeSettings);

  settingsSheet.addEventListener("click", e => {
    // 方形开关
    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      const next = toggle.getAttribute("aria-pressed") !== "true";
      toggle.setAttribute("aria-pressed", String(next));
      emit("setting", { key: toggle.dataset.toggle, value: next });
      return;
    }
    // 分段控件
    const tab = e.target.closest(".set-tabs .mode-tab");
    if (tab) {
      tab.parentElement.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      emit("setting", { key: tab.parentElement.dataset.setting, value: tab.dataset.value });
      return;
    }
    // 跳到对应面板
    const jump = e.target.closest("[data-open-panel]");
    if (jump) { closeSettings(); openSheet(jump.dataset.openPanel); return; }
    // 破坏性操作：二次确认，不真的改数据
    const danger = e.target.closest("[data-confirm]");
    if (danger) {
      const label = danger.querySelector(".set-label");
      if (danger.dataset.armed === "1") {
        danger.dataset.armed = "0";
        label.textContent = "Forget this session";
      } else {
        danger.dataset.armed = "1";
        label.textContent = danger.dataset.confirm;
        setTimeout(() => {
          if (danger.dataset.armed === "1") {
            danger.dataset.armed = "0";
            label.textContent = "Forget this session";
          }
        }, 3000);
      }
    }
  });

  // ═══ 附件动作 sheet ═══
  const attachBtn = document.getElementById("attachBtn");
  const attachSheet = document.getElementById("attachSheet");
  const attachCancel = document.getElementById("attachCancel");

  function openAttach() {
    closeSheet();                 // 与 Memory/Control 互斥
    closeSettings();
    attachSheet.hidden = false;
    sheetScrim.hidden = false;
    attachBtn.classList.add("open");
  }
  function closeAttach() {
    attachSheet.hidden = true;
    if (memoryPanel.hidden && settingsSheet.hidden) sheetScrim.hidden = true;
    attachBtn.classList.remove("open");
  }
  attachBtn.addEventListener("click", () => {
    if (attachSheet.hidden) openAttach(); else closeAttach();
  });
  attachCancel.addEventListener("click", closeAttach);
  attachSheet.addEventListener("click", e => {
    const item = e.target.closest(".action-item");
    if (!item) return;
    const label = item.querySelector("span").textContent.trim().toLowerCase();
    const KIND = { "camera": "camera", "photos": "photos", "reference": "reference",
      "point at clay": "point", "move the arm": "arm", "look again": "scan",
      "save this piece": "piece" };
    emit("attach", { kind: KIND[label] || label });
    closeAttach();
  });

  // ═══ 按住麦克风 = 录音态 ═══
  const micBtn = document.getElementById("micBtn");
  const recorder = document.getElementById("recorder");
  const recTime = document.getElementById("recTime");
  const recWave = document.getElementById("recWave");
  const recHint = document.getElementById("recHint");

  const WAVE_BARS = 34;
  const CANCEL_PX = 70;       // 左滑超过这个距离即取消
  let recActive = false, recStart = 0, recRaf = null, recTimer = null, recOriginX = 0;

  // 波形条一次建好，之后只改 transform，避免每帧重建 DOM
  recWave.innerHTML = Array.from({ length: WAVE_BARS }, () => "<i></i>").join("");
  const waveBars = [...recWave.querySelectorAll("i")];

  function fmtTime(ms) {
    const t = Math.floor(ms / 1000);
    return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
  }

  function animateWave() {
    const t = performance.now() / 130;
    waveBars.forEach((bar, i) => {
      // 两个不同频率的正弦叠一点随机，读起来像人声包络而不是等幅条
      const env = Math.sin(t - i * 0.42) * 0.5 + Math.sin(t * 0.6 - i * 0.17) * 0.3;
      const h = 1 + Math.abs(env) * 8 + Math.random() * 1.6;
      bar.style.transform = "scaleY(" + h.toFixed(2) + ")";
    });
    recRaf = requestAnimationFrame(animateWave);
  }

  function startRec(e) {
    if (recActive) return;
    recActive = true;
    recOriginX = e.clientX;
    recStart = performance.now();
    recTime.textContent = "0:00";
    recHint.innerHTML = "&#8592; Slide to cancel";
    recorder.classList.remove("will-cancel");
    recorder.hidden = false;
    micBtn.classList.add("recording");
    try { micBtn.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    recRaf = requestAnimationFrame(animateWave);
    recTimer = setInterval(() => { recTime.textContent = fmtTime(performance.now() - recStart); }, 200);
  }

  function moveRec(e) {
    if (!recActive) return;
    const dx = recOriginX - e.clientX;
    recorder.classList.toggle("will-cancel", dx > CANCEL_PX);
    recHint.textContent = dx > CANCEL_PX ? "Release to cancel" : "← Slide to cancel";
  }

  function endRec() {
    if (!recActive) return;
    recActive = false;
    if (recRaf) { cancelAnimationFrame(recRaf); recRaf = null; }
    if (recTimer) { clearInterval(recTimer); recTimer = null; }
    recorder.hidden = true;
    const cancelled = recorder.classList.contains("will-cancel");
    recorder.classList.remove("will-cancel");
    micBtn.classList.remove("recording");
    emit("voice", { durationMs: Math.round(performance.now() - recStart), cancelled: cancelled });
  }

  micBtn.addEventListener("pointerdown", startRec);
  micBtn.addEventListener("pointermove", moveRec);
  micBtn.addEventListener("pointerup", endRec);
  micBtn.addEventListener("pointercancel", endRec);
  micBtn.addEventListener("contextmenu", e => e.preventDefault());

  // ── Control：手柄式机械臂操控 ──
  const joystick = document.getElementById("joystick");
  const joystickKnob = document.getElementById("joystickKnob");
  const armStateLabel = document.getElementById("armStateLabel");
  const manualBadge = document.getElementById("manualBadge");
  const homeBtn = document.getElementById("homeBtn");
  const speedTabs = document.querySelectorAll(".speed-tabs .mode-tab");
  const wsCanvas = document.getElementById("wsCanvas");

  const KNOB_R = 46;        // 摇杆最大位移半径（px）
  const SPEEDS = { slow: 0.22, fast: 0.55 };  // 每帧位移，单位为 SVG 的 0-100 坐标

  let stickX = 0, stickY = 0;   // 摇杆归一化偏移 -1..1
  let speedStep = SPEEDS.slow;
  let armGeom = null;           // 接管时锁定的连杆几何
  let rafId = null;
  let dragging = false;

  // 人接管：以当前姿态为起点，锁定两段连杆长度和肘部朝向
  function engageManual() {
    if (manualArm) return;
    const p = currentBeat && currentBeat.robot_pose_points;
    if (!p) return;

    const bx = p.base[0], by = p.base[1];
    const ex = p.elbow[0], ey = p.elbow[1];
    const tx = p.tcp[0], ty = p.tcp[1];
    const L1 = Math.hypot(ex - bx, ey - by);
    const L2 = Math.hypot(tx - ex, ty - ey);
    if (L1 < 0.01 || L2 < 0.01) return;

    // 记录肘部在 base→tcp 连线的哪一侧，保证解算不会突然翻面
    let dx = tx - bx, dy = ty - by;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const hSigned = (ex - bx) * (-uy) + (ey - by) * ux;

    armGeom = { bx, by, L1, L2, tx, ty, sign: hSigned >= 0 ? 1 : -1 };
    manualArm = true;
    wsCanvas.classList.add("manual");
    manualBadge.hidden = false;
    wsPoseLabel.textContent = "MANUAL";
    armStateLabel.textContent = "MANUAL";
    emit("arm-takeover", { active: true, tcp: { x: tx, y: ty } });
  }

  // 二连杆逆运动学：给定 TCP 目标，解出肘部位置
  function applyManualArm() {
    const g = armGeom;
    if (!g) return;

    let dx = g.tx - g.bx, dy = g.ty - g.by;
    let d = Math.hypot(dx, dy);
    if (d < 1e-4) { dx = 0.001; dy = 0; d = 0.001; }

    // 目标超出可达范围时钳制，并回写，避免摇杆持续推动造成漂移
    const maxD = (g.L1 + g.L2) * 0.999;
    const minD = Math.abs(g.L1 - g.L2) * 1.001 + 0.01;
    const cd = Math.min(maxD, Math.max(minD, d));
    const ux = dx / d, uy = dy / d;
    g.tx = g.bx + ux * cd;
    g.ty = g.by + uy * cd;

    const a = (g.L1 * g.L1 - g.L2 * g.L2 + cd * cd) / (2 * cd);
    const h = Math.sqrt(Math.max(0, g.L1 * g.L1 - a * a));
    const mx = g.bx + ux * a, my = g.by + uy * a;
    const ex = mx + (-uy) * h * g.sign;
    const ey = my + ux * h * g.sign;

    setArm(g.bx, g.by, ex, ey, g.tx, g.ty);
  }

  function tick() {
    if (manualArm && armGeom && (stickX !== 0 || stickY !== 0)) {
      armGeom.tx = Math.min(96, Math.max(4, armGeom.tx + stickX * speedStep));
      armGeom.ty = Math.min(96, Math.max(4, armGeom.ty + stickY * speedStep));
      applyManualArm();
    }
    rafId = requestAnimationFrame(tick);
  }

  function moveKnob(e) {
    const r = joystick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy);
    if (dist > KNOB_R) { dx = dx / dist * KNOB_R; dy = dy / dist * KNOB_R; }
    joystickKnob.style.transform =
      "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
    stickX = dx / KNOB_R;
    stickY = dy / KNOB_R;
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    stickX = 0; stickY = 0;
    joystick.classList.remove("active");
    joystickKnob.style.transform = "translate(-50%, -50%)";
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  joystick.addEventListener("pointerdown", e => {
    dragging = true;
    // 捕获失败不应中断拖拽
    try { joystick.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    joystick.classList.add("active");
    engageManual();
    moveKnob(e);
    if (!rafId) rafId = requestAnimationFrame(tick);
  });
  joystick.addEventListener("pointermove", e => { if (dragging) moveKnob(e); });
  joystick.addEventListener("pointerup", endDrag);
  joystick.addEventListener("pointercancel", endDrag);

  speedTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      speedTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      speedStep = SPEEDS[tab.dataset.speed] || SPEEDS.slow;
    });
  });

  // 交还控制权：机械臂回到脚本当前 beat 的姿态
  function releaseManual() {
    endDrag();
    if (!manualArm) return;
    manualArm = false;
    armGeom = null;
    wsCanvas.classList.remove("manual");
    manualBadge.hidden = true;
    if (currentBeat) {
      applyPose(currentBeat);
      wsPoseLabel.textContent = (currentBeat.robot_pose || "idle").replace(/_/g, " ").toUpperCase();
    }
    updateControlPanel();
    emit("arm-takeover", { active: false });
  }
  homeBtn.addEventListener("click", releaseManual);

  function updateControlPanel() {
    if (manualArm) { armStateLabel.textContent = "MANUAL"; return; }
    const pose = currentBeat ? currentBeat.robot_pose : "idle";
    armStateLabel.textContent = (pose || "idle").replace(/_/g, " ").toUpperCase();
  }

  // ── Helpers ──
  function escapeHtml(s) {
    if (!s) return "";
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function formatIntent(s) {
    return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
})();
