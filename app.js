(() => {
  const STORE_KEY = "unipark-ai-prototype-v1";
  const TOKEN_LIFETIME_MS = 3 * 60 * 1000;
  const root = document.querySelector("#app");
  const seed = {
    sessionUserId: null,
    currentUserId: "STU-2048",
    view: "dashboard",
    adminTab: "overview",
    students: [
      {
        id: "STU-2048", name: "Jordan Lee", email: "jordan.lee@northstar.edu",
        status: "approved", submittedAt: "2026-10-29T08:45:00.000Z", approvedAt: "2026-10-29T10:12:00.000Z",
        vehicle: { plate: "51A-248.36", type: "Motorcycle", make: "Honda Vision", color: "Pearl white", status: "Outside campus", lastCheckin: null, lastCheckout: null },
        documents: ["Student ID", "Vehicle registration", "Plate photo"]
      },
      {
        id: "STU-3196", name: "Taylor Reed", email: "taylor.reed@northstar.edu",
        status: "pending", submittedAt: "2026-11-04T03:20:00.000Z", approvedAt: null,
        vehicle: { plate: "59B-731.08", type: "Motorcycle", make: "Yamaha Janus", color: "Midnight blue", status: "Outside campus", lastCheckin: null, lastCheckout: null },
        documents: ["Student ID", "Vehicle registration", "Plate photo"]
      }
    ],
    tokens: [
      { token: "UP-OLD0182DFA144", studentId: "STU-2048", createdAt: "2026-11-04T09:00:00.000Z", expiresAt: "2026-11-04T09:03:00.000Z", status: "expired", usedAt: null },
      { token: "UP-USED1B63AE901C", studentId: "STU-2048", createdAt: "2026-11-04T08:50:00.000Z", expiresAt: "2026-11-04T08:53:00.000Z", status: "used", usedAt: "2026-11-04T08:51:00.000Z" }
    ],
    events: [
      { id: "EV-1", type: "review", studentId: "STU-2048", at: "2026-10-29T10:12:00.000Z", result: "Approved", detail: "Jordan Lee's vehicle registration was approved." },
      { id: "EV-2", type: "checkin", studentId: "STU-2048", at: "2026-11-04T08:32:00.000Z", result: "Check-in successful", detail: "Camera plate match: 51A-248.36" },
      { id: "EV-3", type: "checkout_failed", studentId: "STU-2048", at: "2026-11-04T08:55:00.000Z", result: "QR already used", detail: "Replay of a previously used token was blocked." },
      { id: "EV-4", type: "checkout", studentId: "STU-2048", at: "2026-11-04T09:10:00.000Z", result: "Check-out successful", detail: "Plate match: 51A-248.36" },
      { id: "EV-5", type: "application", studentId: "STU-3196", at: "2026-11-04T03:20:00.000Z", result: "Application submitted", detail: "Vehicle verification is waiting for admin review." }
    ]
  };

  let state = loadState();
  let toastTimer = 0;
  let cameraStream = null;
  let scanTimer = 0;
  let pendingReview = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && Array.isArray(saved.students) && Array.isArray(saved.events) && Array.isArray(saved.tokens)) { if (!Object.hasOwn(saved, "sessionUserId")) saved.sessionUserId = null; saved.students.forEach(student=>delete student.department); return saved; }
    } catch (_) { /* Start clean if local prototype data cannot be read. */ }
    return structuredClone(seed);
  }
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
  function normalizePlate(value) { return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
  function fmtDate(value, includeDate = true) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-US", includeDate ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } : { hour: "numeric", minute: "2-digit" }).format(new Date(value));
  }
  function relativeTime(value) {
    if (!value) return "No recent activity";
    const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return `${Math.round(hours / 24)} days ago`;
  }
  function icon(name) {
    const paths = {
      grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
      file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
      scan: '<path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M4 12h16"/>',
      shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/>',
      car: '<path d="m5 11 1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><path d="M3 11h18v7H3zM6 18v2M18 18v2M6 14h.01M18 14h.01"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      camera: '<path d="M14 4h-4l-2 3H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
      refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/>',
      arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
      carFront: '<path d="m5 11 1.5-4A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11M3 11h18v8H3zM6 19v2M18 19v2M6 14h.01M18 14h.01"/>',
      qr: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM19 14h2M19 19h2M14 19h2"/>',
      shieldCheck: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z"/><path d="m9 12 2 2 4-4"/>',
      alert: '<path d="M10.3 3.9 1.8 18.5A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.5L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
      close: '<path d="m18 6-12 12M6 6l12 12"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.grid}</svg>`;
  }
  function navItems(role) {
    if (role === "student") return [{ id: "dashboard", label: "My dashboard", icon: "grid" }, { id: "register", label: "Vehicle verification", icon: "file" }];
    if (role === "guard") return [{ id: "guard", label: "Guard check-out", icon: "scan" }];
    return [{ id: "admin", label: "Admin overview", icon: "grid" }, { id: "students", label: "Students & vehicles", icon: "users" }, { id: "activity", label: "Activity log", icon: "clock" }];
  }
  function getStudent(id = state.currentUserId) { return state.students.find(student => student.id === id); }
  function role() { return state.currentUserId === "admin" ? "admin" : state.currentUserId === "guard" ? "guard" : "student"; }
  function statusBadge(label, kind) { return `<span class="status status-${kind}">${esc(label)}</span>`; }
  function studentStatus(student) { return student.status === "approved" ? statusBadge("Verified", "green") : student.status === "pending" ? statusBadge("Under review", "amber") : statusBadge("Rejected", "red"); }
  function vehicleStatus(vehicle) { return vehicle.status === "Parked on campus" ? statusBadge("Parked on campus", "blue") : statusBadge("Outside campus", "gray"); }
  function initials(name = "U") { return name.split(/\s+/).map(word => word[0]).slice(0, 2).join("").toUpperCase(); }
  function activeToken(studentId) {
    return state.tokens.find(token => token.studentId === studentId && token.status === "active" && token.expiresAt > Date.now());
  }
  function selectedAccount() {
    if (state.currentUserId === "admin") return "School Admin";
    if (state.currentUserId === "guard") return "Security Guard";
    return getStudent()?.name || "Student";
  }
  function renderNav(roleName, mobile = false) {
    const items = navItems(roleName);
    return items.map(item => `<button class="nav-item ${state.view === item.id ? "active" : ""}" data-nav="${item.id}"><span class="nav-icon">${icon(item.icon)}</span><span>${item.label}</span></button>`).join("");
  }
  function renderLogin() {
    const roleOptions = [["student","Student"],["guard","Security Guard"],["admin","School Admin"]];
    return `<main class="login-page"><header class="login-top"><div class="brand"><div class="brand-mark">${icon("car")}</div><div class="brand-name">UniPark <span>AI</span></div></div><span class="login-demo-pill">DEMO ACCESS</span></header><div class="login-layout"><section class="login-intro"><div class="eyebrow">Smart campus parking</div><h1>One campus.<br />A smoother way to park.</h1><p>Sign in to manage vehicle verification, campus entry, and secure vehicle pick-up.</p><div class="login-feature">${icon("shieldCheck")}<span>Role-based demo views for students, security, and school admins.</span></div><div class="login-feature">${icon("qr")}<span>Short-lived QR exit passes and a simulated gate check.</span></div><div class="login-illustration" aria-hidden="true"><div class="road-line"></div><div class="login-car">${icon("car")}</div><span class="parking-pin">P</span></div></section><section class="card login-card"><div class="eyebrow">Welcome to UniPark AI</div><h2>Sign in to your account</h2><p class="section-note">Students can use a demo account or create a new account.</p>${state.loginError?`<div class="result-box result-error"><div class="result-title">Sign-in failed</div>${esc(state.loginError)}</div>`:""}<form id="login-form" class="login-form"><div class="field"><label for="login-role">I am signing in as</label><select id="login-role" name="role">${roleOptions.map(([value,label])=>`<option value="${value}" ${state.loginRole===value?"selected":""}>${label}</option>`).join("")}</select></div><div class="field"><label for="login-email">Email address</label><input id="login-email" name="email" type="email" value="${esc(state.loginEmail || "jordan.lee@northstar.edu")}" placeholder="you@university.edu" autocomplete="username" required /></div><div class="field"><label for="login-password">Password</label><input id="login-password" name="password" type="password" placeholder="Enter password" autocomplete="current-password" required /></div><button class="btn btn-primary btn-full login-submit" type="submit">Sign in ${icon("arrow")}</button></form><div class="auth-switch">New student? <button type="button" data-action="show-signup">Create an account</button></div><details class="demo-credentials"><summary>Show staff and sample student demo credentials</summary><div><span>Student</span><code>jordan.lee@northstar.edu</code><code>student123</code></div><div><span>Security</span><code>guard@unipark.edu</code><code>guard123</code></div><div><span>Admin</span><code>admin@unipark.edu</code><code>admin123</code></div></details><p class="disclaimer">Prototype authentication only. New student passwords are stored locally in this browser; this is not suitable for real accounts.</p></section></div><footer class="login-footer">${icon("shield")} UniPark AI · Campus parking prototype</footer></main>`;
  }
  function renderSignup() {
    return `<main class="login-page"><header class="login-top"><div class="brand"><div class="brand-mark">${icon("car")}</div><div class="brand-name">UniPark <span>AI</span></div></div><span class="login-demo-pill">STUDENT REGISTRATION</span></header><div class="signup-wrap"><section class="card login-card signup-card"><div class="eyebrow">Create your student account</div><h2>Get started with UniPark AI</h2><p class="section-note">Create a sign-in, then submit your vehicle for school review.</p>${state.signupError?`<div class="result-box result-error"><div class="result-title">Could not create account</div>${esc(state.signupError)}</div>`:""}<form id="signup-form" class="login-form"><div class="field"><label for="signup-name">Full name</label><input id="signup-name" name="name" autocomplete="name" required placeholder="e.g. Alex Morgan" /></div><div class="field"><label for="signup-id">Student ID</label><input id="signup-id" name="studentId" required placeholder="e.g. STU-4821" /></div><div class="field"><label for="signup-email">University email</label><input id="signup-email" name="email" type="email" autocomplete="email" required placeholder="name@university.edu" /></div><div class="field"><label for="signup-password">Create password</label><input id="signup-password" name="password" type="password" minlength="8" autocomplete="new-password" required placeholder="At least 8 characters" /></div><div class="field"><label for="signup-confirm">Confirm password</label><input id="signup-confirm" name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required placeholder="Enter the password again" /></div><button class="btn btn-primary btn-full login-submit" type="submit">Create account & continue ${icon("arrow")}</button></form><div class="auth-switch">Already registered? <button type="button" data-action="show-login">Sign in</button></div><p class="disclaimer">Account details are saved in local storage for this demo only. Your profile will remain pending until the school admin approves it.</p></section></div><footer class="login-footer">${icon("shield")} UniPark AI · Campus parking prototype</footer></main>`;
  }
  function renderShell() {
    const currentRole = role();
    return `<div class="app-shell">
      <header class="topbar">
        <div class="brand"><div class="brand-mark">${icon("car")}</div><div class="brand-name">UniPark <span>AI</span></div></div>
        <div class="topbar-right"><span class="demo-label">${esc(selectedAccount())}</span><button class="btn btn-secondary btn-sm reset-demo" data-action="reset-demo" title="Restore the original sample data">Reset demo</button><button class="btn btn-secondary btn-sm" data-action="logout">Sign out</button><div class="user-chip">${esc(initials(selectedAccount()))}</div></div>
      </header>
      <div class="layout">
        <aside class="sidebar"><div class="side-caption">${currentRole === "student" ? "Student portal" : currentRole === "guard" ? "Security station" : "Administration"}</div><nav class="nav-list">${renderNav(currentRole)}</nav><div class="side-bottom"><div class="side-caption">About this prototype</div><div class="prototype-card"><strong>Simulation mode</strong>Verification, ANPR and access tokens run locally in this browser. No documents leave this device.</div></div></aside>
        <main class="main"><div class="content">${renderPage()}</div></main>
      </div>
      <nav class="mobile-nav" aria-label="Main navigation">${renderNav(currentRole, true)}</nav>
      ${pendingReview ? renderReviewModal() : ""}
    </div>`;
  }
  function renderPage() {
    const currentRole = role();
    if (currentRole === "student") return state.view === "register" ? renderRegistration() : renderStudentDashboard();
    if (currentRole === "guard") return renderGuard();
    return renderAdmin();
  }
  function renderHeader(eyebrow, title, subtitle, actions = "") {
    return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="page-subtitle">${subtitle}</p></div>${actions ? `<div class="page-head-actions">${actions}</div>` : ""}</div>`;
  }
  function metric(label, value, caption, iconName, tint = "") {
    return `<article class="card metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon" ${tint ? `style="background:${tint}"` : ""}>${icon(iconName)}</span></div><div class="metric-value">${value}</div><div class="metric-foot">${caption}</div></article>`;
  }
  function renderStudentDashboard() {
    const student = getStudent();
    if (!student) return `<div class="empty-state"><strong>Student account not found</strong>Choose a demo account or submit a registration.</div>`;
    const vehicle = student.vehicle;
    const token = activeToken(student.id);
    const parked = vehicle.status === "Parked on campus";
    const approved = student.status === "approved";
    const currentStep = !approved ? 1 : parked ? 3 : 2;
    const qrPanel = parked ? token ? `<article class="card qr-card"><div class="eyebrow">Secure exit pass</div><h2>Your dynamic QR</h2><p class="section-note">Show this pass to a security guard when leaving campus.</p><div class="qr-frame"><canvas id="student-qr" width="164" height="164" aria-label="Dynamic vehicle exit QR code"></canvas></div><div class="token-string">${esc(token.token)} <button class="btn btn-secondary btn-sm" data-action="copy-token" data-token="${esc(token.token)}">Copy</button></div><div class="expiry">${icon("clock")} Expires in <strong data-countdown="${token.expiresAt}">--:--</strong> · One use only</div><button class="btn btn-secondary btn-full" data-action="refresh-token">${icon("refresh")} Generate a new QR</button></article>` : `<article class="card qr-card"><div class="eyebrow">Secure exit pass</div><h2>QR pass expired</h2><p class="section-note">Generate a fresh short-lived pass before visiting the gate.</p><div class="qr-empty"><div class="qr-empty-inner">${icon("qr")}<br />Your new pass will appear here</div></div><button class="btn btn-primary btn-full" data-action="refresh-token">Generate a new QR</button></article>` : `<article class="card qr-card"><div class="eyebrow">Secure exit pass</div><h2>Pass not available yet</h2><p class="section-note">A QR pass is created only while your vehicle is parked on campus.</p><div class="qr-empty"><div class="qr-empty-inner">${icon("qr")}<br />Check in your vehicle to unlock your pass</div></div>${!approved ? statusBadge("Approval required", "amber") : statusBadge("Vehicle is outside", "gray")}</article>`;
    const alert = !approved ? `<div class="notice warn"><strong>Verification required.</strong> Your vehicle details are ${student.status === "pending" ? "waiting for school admin review" : "not approved"}. Check-in is disabled until your profile is approved.</div>` : "";
    const checkinPanel = approved && !parked ? `<div class="checkin-panel"><div class="section-head"><div><h3>Campus arrival simulation</h3><p class="section-note">Enter the plate read by the gate camera.</p></div>${statusBadge("ANPR demo", "blue")}</div><form id="checkin-form"><div class="form-grid"><div class="field"><label for="checkin-plate">Camera detected plate</label><input id="checkin-plate" name="plate" value="${esc(vehicle.plate)}" autocomplete="off" /></div><div class="field" style="align-self:end"><button class="btn btn-primary btn-full" type="submit">${icon("car")} Confirm vehicle entry</button></div></div><p class="field-hint" style="margin:9px 0 0">The simulated camera result must match the verified plate on file.</p></form></div>` : parked ? `<div class="checkin-panel"><div class="section-head" style="margin:0"><div><h3>Vehicle is on campus</h3><p class="section-note">Entry recorded ${fmtDate(vehicle.lastCheckin)}. Use your QR pass at the exit gate.</p></div>${statusBadge("Entry confirmed", "green")}</div></div>` : "";
    const events = state.events.filter(event => event.studentId === student.id).slice().sort((a,b) => new Date(b.at)-new Date(a.at)).slice(0,4);
    const activity = events.length ? `<div class="timeline">${events.map(event => `<div class="timeline-item"><div class="timeline-dot ${event.type.includes("failed") ? "fail" : ""}">${icon(event.type.includes("failed") ? "alert" : "check")}</div><div><div class="timeline-title">${esc(event.result)}</div><div class="timeline-meta">${esc(event.detail)} · ${fmtDate(event.at)}</div></div></div>`).join("")}</div>` : `<div class="empty-state">Your parking activity will appear here.</div>`;
    const steps = [{label:"Submit details",done:true},{label:"Admin approval",done:approved,current:!approved},{label:"Park & request exit",done:parked,current:approved&&!parked}];
    return `${renderHeader("Student portal", `Welcome back, ${esc(student.name.split(" ")[0])}`, "Your vehicle status and secure campus parking pass.", `<button class="btn btn-secondary" data-nav="register">${icon("file")} Verification profile</button>`)}
      ${alert}
      <div class="stepper">${steps.map((step,index)=>`<div class="step ${step.done?"done":""} ${step.current?"current":""}"><div class="step-dot">${step.done?icon("check"):index+1}</div>${step.label}</div>`).join("")}</div>
      <div class="split"><div>
        <article class="card vehicle-card"><div class="vehicle-cover"><div><div class="eyebrow">Registered vehicle</div><div class="plate-chip plate">${esc(vehicle.plate)}</div></div><svg class="vehicle-illustration" viewBox="0 0 90 60" fill="none" aria-hidden="true"><path d="m17 34 5-14c1-3 3-5 7-5h31c4 0 6 2 7 5l6 14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M10 35h65v12H10z" stroke="currentColor" stroke-width="3"/><circle cx="23" cy="49" r="5" fill="currentColor"/><circle cx="63" cy="49" r="5" fill="currentColor"/><path d="M31 16l-4 16h33l-5-16" stroke="currentColor" stroke-width="2"/></svg></div><div class="vehicle-body"><div class="section-head"><div><h2>${esc(vehicle.make)}</h2><p class="section-note">${esc(vehicle.type)} · ${esc(vehicle.color)}</p></div>${vehicleStatus(vehicle)}</div><div class="grid-2 grid-2-even"><div class="info-row"><span class="info-label">Profile status</span>${studentStatus(student)}</div><div class="info-row"><span class="info-label">Last entry</span><span class="info-value">${vehicle.lastCheckin ? fmtDate(vehicle.lastCheckin) : "No visit yet"}</span></div></div>${checkinPanel}</div></article>
        <article class="card card-pad" style="margin-top:15px"><div class="section-head"><div><h2>Recent activity</h2><p class="section-note">Your latest parking events</p></div>${icon("clock")}</div>${activity}</article>
      </div><div>${qrPanel}<p class="disclaimer" style="margin:10px 4px 0">Demo QR tokens expire after 3 minutes. Local storage is for classroom demos only.</p></div></div>`;
  }
  function renderRegistration() {
    const student = getStudent();
    return `${renderHeader("Student portal", "Vehicle verification", "Submit your student and vehicle details for school admin review.")}
      <div class="notice"><strong>Local demo only.</strong> Choose sample images or dummy files. Selected files are never uploaded; this prototype stores file names only.</div>
      <article class="card card-pad"><div class="section-head"><div><h2>Student and vehicle details</h2><p class="section-note">Fields marked with * are required.</p></div>${student ? studentStatus(student) : ""}</div>
      <form id="registration-form"><div class="form-grid">
        <div class="field"><label for="student-name">Full name *</label><input required id="student-name" name="name" value="${esc(student?.name || "")}" placeholder="e.g. Alex Morgan" /></div>
        <div class="field"><label for="student-id">Student ID *</label><input required id="student-id" name="studentId" value="${esc(student?.id || "")}" placeholder="e.g. STU-4821" ${student ? "readonly" : ""} /></div>
        <div class="field"><label for="student-email">University email *</label><input required type="email" id="student-email" name="email" value="${esc(student?.email || "")}" placeholder="name@university.edu" /></div>
        <div class="field"><label for="plate">Vehicle plate number *</label><input required id="plate" name="plate" value="${esc(student?.vehicle.plate || "")}" placeholder="51A-248.36" /></div>
        <div class="field"><label for="vehicle-type">Vehicle type *</label><select id="vehicle-type" name="vehicleType"><option ${student?.vehicle.type === "Motorcycle" ? "selected" : ""}>Motorcycle</option><option ${student?.vehicle.type === "Car" ? "selected" : ""}>Car</option><option>Bicycle</option></select></div>
        <div class="field"><label for="make">Make and model *</label><input required id="make" name="make" value="${esc(student?.vehicle.make || "")}" placeholder="e.g. Honda Vision" /></div>
        <div class="field"><label for="color">Vehicle color *</label><input required id="color" name="color" value="${esc(student?.vehicle.color || "")}" placeholder="e.g. Pearl white" /></div>
        ${[ ["student-id-photo","Student ID image"], ["registration-photo","Vehicle registration image"], ["plate-photo","Vehicle plate image"] ].map(([id,label])=>`<div class="field"><label>${label} *</label><label class="upload-box" for="${id}"><span class="upload-meta">${icon("upload")}<span class="upload-text"><strong>${label}</strong><small data-file-label="${id}">Choose a sample image (JPG or PNG)</small></span></span><span class="upload-choose">Browse</span><input id="${id}" name="documents" type="file" accept="image/png,image/jpeg" required /></label></div>`).join("")}
        <div class="field full"><p class="disclaimer">For real deployment, use a secure document storage service and a defined retention policy. Do not select real identity documents in this demo.</p></div>
        <div class="field full"><button type="submit" class="btn btn-primary">Submit for verification ${icon("arrow")}</button></div>
      </div></form></article>
      <article class="card card-pad" style="margin-top:16px"><div class="section-head"><div><h2>Review checklist</h2><p class="section-note">School staff will compare these details before activation.</p></div>${icon("shieldCheck")}</div><div class="grid-2 grid-2-even"><div class="info-row"><span class="info-label">Student enrollment</span><span class="info-value">Student ID image</span></div><div class="info-row"><span class="info-label">Vehicle ownership</span><span class="info-value">Registration document</span></div><div class="info-row"><span class="info-label">Plate visibility</span><span class="info-value">Plate photo</span></div><div class="info-row"><span class="info-label">Current profile</span><span class="info-value">${esc(student?.name || "New applicant")}</span></div></div></article>`;
  }
  function renderGuard() {
    const allTokens = state.tokens.slice().reverse();
    const lastFailures = state.events.filter(event=>event.type === "checkout_failed").slice().sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,3);
    const manualOptions = state.students.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ${esc(s.vehicle.plate)}</option>`).join("");
    return `${renderHeader("Security station", "Vehicle check-out", "Scan a student's exit pass and confirm the camera plate before opening the gate.", `<span class="status status-blue">Gate 01 · Active</span>`)}
      <div class="guard-layout"><div>
        <article class="card card-pad"><div class="section-head"><div><h2>Scan exit pass</h2><p class="section-note">Use the camera or enter the token shown in the student's app.</p></div>${statusBadge("One-time token", "green")}</div>
          <div class="scanner-box" id="scanner-box">${state.cameraOpen ? `<video id="camera-video" autoplay muted playsinline></video><span class="scanner-tag">CAMERA LIVE</span>` : `<div class="scanner-content">${icon("camera")}<br />Position the student's QR code inside the frame.</div><span class="scanner-tag">CAMERA READY</span>`}</div>
          <div class="toolbar"><button class="btn btn-secondary" data-action="camera-toggle">${icon("camera")} ${state.cameraOpen ? "Stop camera" : "Start camera scanner"}</button><span class="field-hint">QR scanning requires browser camera permission and BarcodeDetector support.</span></div>
          <form id="checkout-form"><div class="form-grid"><div class="field"><label for="qr-token">QR token</label><input id="qr-token" name="token" value="${esc(state.scannedToken || "")}" placeholder="e.g. UP-48F12A94BC03" autocomplete="off" required /></div><div class="field"><label for="camera-plate">Camera detected plate</label><input id="camera-plate" name="plate" placeholder="Enter or simulate plate number" autocomplete="off" required /></div><div class="field"><label for="guard-student">Student record (lookup helper)</label><select id="guard-student"><option value="">Choose a student to fill plate…</option>${manualOptions}</select></div><div class="field" style="align-self:end"><button type="submit" class="btn btn-primary btn-full">Verify & check out ${icon("arrow")}</button></div></div></form>
          <div id="checkout-result"></div>
        </article>
        <article class="card card-pad" style="margin-top:15px"><div class="section-head"><div><h2>Recent failed attempts</h2><p class="section-note">Every blocked attempt is recorded for admin review.</p></div>${statusBadge(String(state.events.filter(e=>e.type==="checkout_failed").length)+" logged", "red")}</div>${lastFailures.length ? `<div class="timeline">${lastFailures.map(event=>`<div class="timeline-item"><div class="timeline-dot fail">${icon("alert")}</div><div><div class="timeline-title">${esc(event.result)}</div><div class="timeline-meta">${esc(event.detail)} · ${fmtDate(event.at)}</div></div></div>`).join("")}</div>` : `<div class="empty-state">No failed attempts recorded in this demo.</div>`}</article>
      </div><div>
        <article class="card card-pad"><div class="section-head"><div><h2>Try a demo scenario</h2><p class="section-note">Load a failure case into the verification form.</p></div>${icon("alert")}</div><div class="demo-scenarios"><button class="scenario-btn" data-scenario="expired"><span>Expired QR token</span><span>Blocked</span></button><button class="scenario-btn" data-scenario="used"><span>Previously used QR</span><span>Blocked</span></button><button class="scenario-btn" data-scenario="mismatch"><span>Plate mismatch</span><span>Blocked</span></button></div><p class="disclaimer" style="margin:12px 1px 0">For a successful demo: select the Jordan Lee student account, check in the vehicle, then copy the current token from the student dashboard into this guard screen.</p></article>
        <article class="card card-pad" style="margin-top:14px"><div class="section-head"><div><h2>Verification sequence</h2><p class="section-note">All checks must pass.</p></div></div><div class="info-row"><span class="info-label">Token exists & is valid</span>${statusBadge("Required", "blue")}</div><div class="info-row"><span class="info-label">Token not used before</span>${statusBadge("Required", "blue")}</div><div class="info-row"><span class="info-label">Vehicle currently parked</span>${statusBadge("Required", "blue")}</div><div class="info-row"><span class="info-label">Detected plate matches</span>${statusBadge("Required", "blue")}</div></article>
        <p class="disclaimer" style="margin:12px 4px">${allTokens.length} tokens in local demo history. QR values contain random IDs only, never student details.</p>
      </div></div>`;
  }
  function renderAdmin() {
    const pending = state.students.filter(s=>s.status==="pending").length;
    const parked = state.students.filter(s=>s.vehicle.status==="Parked on campus").length;
    const failures = state.events.filter(e=>e.type==="checkout_failed").length;
    const tabs = [{id:"overview",label:"Overview"},{id:"students",label:"Students & vehicles"},{id:"activity",label:"Activity log"}];
    let body = "";
    if (state.adminTab === "overview") {
      const recent = state.events.slice().sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,6);
      body = `<div class="metric-grid">${metric("Registered students",state.students.length,"Across all vehicle profiles","users")}${metric("Vehicles on campus",parked,"Live simulated occupancy","car")}${metric("Pending reviews",pending,"Applications awaiting action","file","#fff4df;color:#a9650a")}${metric("Blocked attempts",failures,"Recorded security events","alert","#fff0ee;color:#c64343")}</div><div class="grid-2"><article class="card card-pad"><div class="section-head"><div><h2>Pending applications</h2><p class="section-note">Review student and vehicle details.</p></div>${pending?statusBadge(`${pending} to review`,"amber"):statusBadge("All caught up","green")}</div>${renderStudentTable(state.students.filter(s=>s.status==="pending"),true)}</article><article class="card card-pad"><div class="section-head"><div><h2>Recent activity</h2><p class="section-note">Latest gate and review events</p></div><button class="btn btn-secondary btn-sm" data-admin-tab="activity">View log</button></div>${recent.length?`<div class="timeline">${recent.map(event=>`<div class="timeline-item"><div class="timeline-dot ${event.type.includes("failed")?"fail":""}">${icon(event.type.includes("failed")?"alert":"check")}</div><div><div class="timeline-title">${esc(event.result)}</div><div class="timeline-meta">${esc(studentName(event.studentId))} · ${fmtDate(event.at)}</div></div></div>`).join("")}</div>`:`<div class="empty-state">No activity yet.</div>`}</article></div>`;
    } else if (state.adminTab === "students") {
      body = `<article class="card card-pad"><div class="toolbar"><div class="search">${icon("search")}<input id="student-search" placeholder="Search name, student ID or plate" /></div><select id="student-filter"><option value="all">All verification states</option><option value="pending">Pending review</option><option value="approved">Verified</option><option value="rejected">Rejected</option></select><select id="vehicle-filter"><option value="all">All vehicle states</option><option value="parked">Parked on campus</option><option value="outside">Outside campus</option></select></div><div id="students-table">${renderStudentTable(state.students)}</div></article>`;
    } else {
      body = `<article class="card card-pad"><div class="toolbar"><div class="search">${icon("search")}<input id="activity-search" placeholder="Search event, student or plate" /></div><select id="event-filter"><option value="all">All events</option><option value="checkin">Check-in</option><option value="checkin_failed">Failed check-in</option><option value="checkout">Successful check-out</option><option value="checkout_failed">Failed check-out</option><option value="review">Profile review</option><option value="application">Applications</option></select></div><div id="activity-table">${renderEventTable(state.events)}</div></article>`;
    }
    return `${renderHeader("School administration", "Campus parking overview", "Review registrations and follow vehicle movement across campus.", `<button class="btn btn-secondary" data-action="export-events">${icon("file")} Export activity</button>`)}<div class="admin-tabs">${tabs.map(tab=>`<button class="admin-tab ${state.adminTab===tab.id?"active":""}" data-admin-tab="${tab.id}">${tab.label}</button>`).join("")}</div>${body}`;
  }
  function studentName(id) { return state.students.find(s=>s.id===id)?.name || id || "Unknown student"; }
  function renderStudentTable(students, compact = false) {
    if (!students.length) return `<div class="empty-state"><strong>No applications to review</strong>New student registrations will appear here.</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Vehicle</th><th>Verification</th><th>Location</th>${compact?"<th>Action</th>":"<th>Submitted</th><th>Actions</th>"}</tr></thead><tbody>${students.map(student=>`<tr><td><div class="person"><div class="avatar">${esc(initials(student.name))}</div><div><div class="person-name">${esc(student.name)}</div><div class="person-sub">${esc(student.id)}</div></div></div></td><td><strong>${esc(student.vehicle.plate)}</strong><div class="person-sub">${esc(student.vehicle.make)}</div></td><td>${studentStatus(student)}</td><td>${vehicleStatus(student.vehicle)}</td>${compact?`<td><div class="table-actions">${student.status==="pending"?`<button class="btn btn-primary btn-sm" data-review="approve" data-student="${esc(student.id)}">Approve</button><button class="btn btn-danger btn-sm" data-review="reject" data-student="${esc(student.id)}">Reject</button>`:`<button class="btn btn-secondary btn-sm" data-switch-student="${esc(student.id)}">Open</button>`}</div></td>`:`<td>${fmtDate(student.submittedAt)}</td><td><div class="table-actions">${student.status==="pending"?`<button class="btn btn-primary btn-sm" data-review="approve" data-student="${esc(student.id)}">Approve</button><button class="btn btn-danger btn-sm" data-review="reject" data-student="${esc(student.id)}">Reject</button>`:`<button class="btn btn-secondary btn-sm" data-switch-student="${esc(student.id)}">View</button>`}</div></td>`}</tr>`).join("")}</tbody></table></div>`;
  }
  function eventBadge(event) {
    if (event.type === "checkin_failed") return statusBadge("Failed check-in", "red");
    if (event.type === "checkin") return statusBadge("Check-in", "blue");
    if (event.type === "checkout") return statusBadge("Check-out", "green");
    if (event.type === "checkout_failed") return statusBadge("Failed attempt", "red");
    if (event.type === "review") return statusBadge("Review", "green");
    return statusBadge("Application", "amber");
  }
  function renderEventTable(events) {
    const sorted = events.slice().sort((a,b)=>new Date(b.at)-new Date(a.at));
    if (!sorted.length) return `<div class="empty-state"><strong>No activity found</strong>Gate scans and profile decisions will appear here.</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Time</th><th>Event</th><th>Student</th><th>Details</th><th>Result</th></tr></thead><tbody>${sorted.map(event=>`<tr><td>${fmtDate(event.at)}</td><td>${eventBadge(event)}</td><td><div class="person"><div class="avatar">${esc(initials(studentName(event.studentId)))}</div><div><div class="person-name">${esc(studentName(event.studentId))}</div><div class="person-sub">${esc(event.studentId)}</div></div></div></td><td>${esc(event.detail)}</td><td><strong>${esc(event.result)}</strong></td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderReviewModal() {
    const student = getStudent(pendingReview.studentId);
    if (!student) return "";
    const verb = pendingReview.decision === "approve" ? "Approve" : "Reject";
    return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="review-title"><div class="eyebrow">Profile review</div><h2 id="review-title">${verb} ${esc(student.name)}?</h2><p class="page-subtitle">${pendingReview.decision === "approve" ? `This enables check-in for vehicle ${esc(student.vehicle.plate)}.` : "This keeps vehicle check-in disabled for this profile."}</p><div class="info-row"><span class="info-label">Student ID</span><span class="info-value">${esc(student.id)}</span></div><div class="info-row"><span class="info-label">Vehicle plate</span><span class="info-value">${esc(student.vehicle.plate)}</span></div><div class="info-row"><span class="info-label">Demo documents</span><span class="info-value">${esc((student.documents || []).length)} file names</span></div><div class="modal-actions"><button class="btn btn-secondary" data-action="cancel-review">Cancel</button><button class="btn ${pendingReview.decision === "approve" ? "btn-primary" : "btn-danger"}" data-action="confirm-review">Confirm ${verb.toLowerCase()}</button></div></section></div>`;
  }
  function render() {
    if (!state.sessionUserId) { root.innerHTML = state.authView === "signup" ? renderSignup() : renderLogin(); return; }
    root.innerHTML = renderShell();
    const student = getStudent();
    const token = student && activeToken(student.id);
    if (token) drawQr(token.token);
    if (role() === "student") startCountdown();
  }
  function showToast(message) {
    const region = document.querySelector("#toast-region");
    region.innerHTML = `<div class="toast">${esc(message)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { region.innerHTML = ""; }, 3000);
  }
  function withLoading(form, label, task) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return task();
    button.disabled = true;
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${esc(label)}`;
    setTimeout(() => { if (root.contains(form)) task(); }, 420);
  }
  async function hashPassword(password, salt = "") {
    if (!window.crypto?.subtle) throw new Error("Secure password hashing is unavailable here. Open this app through localhost or HTTPS and try again.");
    const bytes=await window.crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${salt}:${password}`));
    return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
  }
  function setView(view) {
    stopCamera();
    state.view = view;
    if (view === "admin") state.adminTab = "overview";
    if (view === "students") state.adminTab = "students";
    if (view === "activity") state.adminTab = "activity";
    save(); render();
  }
  function addEvent(type, studentId, result, detail) {
    state.events.unshift({ id: `EV-${Date.now()}-${Math.random().toString(16).slice(2,6)}`, type, studentId, at: new Date().toISOString(), result, detail });
  }
  function randomToken() {
    const bytes = new Uint8Array(8);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let i=0;i<bytes.length;i++) bytes[i]=Math.floor(Math.random()*256);
    return `UP-${Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("").toUpperCase()}`;
  }
  function createToken(student) {
    state.tokens.forEach(token => { if (token.studentId === student.id && token.status === "active") token.status = "replaced"; });
    const token = { token: randomToken(), studentId: student.id, createdAt: Date.now(), expiresAt: Date.now() + TOKEN_LIFETIME_MS, status: "active", usedAt: null };
    state.tokens.push(token);
    return token;
  }
  function startCountdown() {
    const el = document.querySelector("[data-countdown]");
    if (!el) return;
    const end = Number(el.dataset.countdown);
    const update = () => {
      const left = Math.max(0, end - Date.now());
      el.textContent = `${String(Math.floor(left/60000)).padStart(2,"0")}:${String(Math.floor((left%60000)/1000)).padStart(2,"0")}`;
      if (left <= 0 && document.body.contains(el)) { save(); setTimeout(render, 250); }
    };
    update();
    const timer = setInterval(() => { if (!document.body.contains(el)) clearInterval(timer); else update(); }, 1000);
  }
  function doCheckin(plateInput) {
    const student = getStudent();
    if (!student || student.status !== "approved") return { ok: false, message: "Profile approval is required before campus entry." };
    if (student.vehicle.status === "Parked on campus") return { ok: false, message: "This vehicle is already checked in." };
    if (normalizePlate(plateInput) !== normalizePlate(student.vehicle.plate)) {
      addEvent("checkin_failed", student.id, "Check-in plate mismatch", `Camera read ${plateInput || "no plate"}; expected ${student.vehicle.plate}.`);
      save(); return { ok: false, message: `Plate mismatch. Camera read “${plateInput || "(empty)"}”; expected “${student.vehicle.plate}”. This attempt was recorded.` };
    }
    const now = new Date().toISOString();
    student.vehicle.status = "Parked on campus";
    student.vehicle.lastCheckin = now;
    student.vehicle.lastCheckout = null;
    createToken(student);
    addEvent("checkin", student.id, "Check-in successful", `Camera plate match: ${student.vehicle.plate}`);
    save(); return { ok: true, message: "Plate matched. Vehicle checked in and a short-lived exit QR is ready." };
  }
  function doCheckout(tokenInput, plateInput) {
    const tokenString = String(tokenInput || "").trim().toUpperCase();
    const token = state.tokens.find(item => item.token.toUpperCase() === tokenString);
    let studentId = token?.studentId;
    let reason = "";
    if (!token) reason = "QR token not recognized";
    else if (token.status === "used" || token.usedAt) reason = "QR already used";
    else if (token.status === "expired" || token.expiresAt <= Date.now()) { token.status = "expired"; reason = "QR token expired"; }
    else if (token.status !== "active") reason = "QR token is no longer active";
    const student = studentId ? getStudent(studentId) : null;
    if (!reason && !student) reason = "Student record not found";
    if (!reason && student.status !== "approved") reason = "Student profile is not approved";
    if (!reason && student.vehicle.status !== "Parked on campus") reason = "Vehicle is not currently parked on campus";
    if (!reason && normalizePlate(plateInput) !== normalizePlate(student.vehicle.plate)) reason = `Plate mismatch: camera read ${plateInput || "(empty)"}; expected ${student.vehicle.plate}`;
    if (reason) {
      addEvent("checkout_failed", studentId || "Unknown", reason, `QR ${tokenString || "(empty)"} · ${plateInput ? `camera plate ${plateInput}` : "no plate read"}`);
      save(); return { ok: false, title: "Check-out blocked", message: `${reason}. The attempt was added to the activity log.` };
    }
    token.status = "used";
    token.usedAt = Date.now();
    student.vehicle.status = "Outside campus";
    student.vehicle.lastCheckout = new Date().toISOString();
    addEvent("checkout", student.id, "Check-out successful", `Plate match: ${student.vehicle.plate}`);
    save(); return { ok: true, title: "Check-out approved", message: `${student.name}'s plate matches. QR consumed and vehicle marked outside campus.` };
  }
  function reviewStudent(studentId, decision) {
    const student = getStudent(studentId);
    if (!student || student.status !== "pending") return;
    student.status = decision === "approve" ? "approved" : "rejected";
    student.approvedAt = decision === "approve" ? new Date().toISOString() : null;
    addEvent("review", student.id, decision === "approve" ? "Profile approved" : "Profile rejected", `${student.vehicle.plate} · ${decision === "approve" ? "Check-in enabled" : "Check-in remains disabled"}`);
    pendingReview = null; save(); render(); showToast(decision === "approve" ? "Student profile approved." : "Application rejected.");
  }
  function filterStudentTable() {
    const search = (document.querySelector("#student-search")?.value || "").trim().toLowerCase();
    const verification = document.querySelector("#student-filter")?.value || "all";
    const vehicle = document.querySelector("#vehicle-filter")?.value || "all";
    const rows = state.students.filter(student => {
      const text = `${student.name} ${student.id} ${student.vehicle.plate} ${student.vehicle.make}`.toLowerCase();
      return (!search || text.includes(search)) && (verification === "all" || student.status === verification) && (vehicle === "all" || (vehicle === "parked" ? student.vehicle.status === "Parked on campus" : student.vehicle.status === "Outside campus"));
    });
    document.querySelector("#students-table").innerHTML = renderStudentTable(rows);
  }
  function filterEventTable() {
    const search = (document.querySelector("#activity-search")?.value || "").trim().toLowerCase();
    const type = document.querySelector("#event-filter")?.value || "all";
    const events = state.events.filter(event => {
      const student = getStudent(event.studentId);
      const text = `${event.result} ${event.detail} ${student?.name || ""} ${student?.vehicle.plate || ""}`.toLowerCase();
      return (!search || text.includes(search)) && (type === "all" || event.type === type);
    });
    document.querySelector("#activity-table").innerHTML = renderEventTable(events);
  }
  function cameraToggle() {
    if (cameraStream) { stopCamera(); render(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !("BarcodeDetector" in window)) { showToast("This browser does not support live QR scanning. Enter the token manually."); return; }
    state.cameraOpen = true; render();
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }).then(stream => {
      cameraStream = stream;
      const video = document.querySelector("#camera-video");
      if (!video) return stopCamera();
      video.srcObject = stream;
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      scanTimer = setInterval(async () => {
        const currentVideo = document.querySelector("#camera-video");
        if (!currentVideo || currentVideo.readyState < 2) return;
        try {
          const codes = await detector.detect(currentVideo);
          if (codes[0]?.rawValue) {
            state.scannedToken = codes[0].rawValue;
            showToast("QR token scanned. Enter the camera plate to continue.");
            stopCamera(); render();
          }
        } catch (_) { /* Keep the manual entry path available if frame decoding fails. */ }
      }, 500);
    }).catch(() => { state.cameraOpen = false; render(); showToast("Camera permission was unavailable. Enter the QR token manually."); });
  }
  function stopCamera() {
    clearInterval(scanTimer); scanTimer = 0;
    if (cameraStream) cameraStream.getTracks().forEach(track=>track.stop());
    cameraStream = null; state.cameraOpen = false;
  }
  function loadScenario(type) {
    const tokenField = document.querySelector("#qr-token");
    const plateField = document.querySelector("#camera-plate");
    if (!tokenField || !plateField) return;
    const student = state.students.find(s=>s.status === "approved") || state.students[0];
    if (type === "expired") {
      const token = state.tokens.find(t=>t.status === "expired");
      tokenField.value = token?.token || "UP-OLD0182DFA144"; plateField.value = student?.vehicle.plate || "";
    } else if (type === "used") {
      const token = state.tokens.find(t=>t.status === "used");
      tokenField.value = token?.token || "UP-USED1B63AE901C"; plateField.value = student?.vehicle.plate || "";
    } else {
      const token = state.tokens.find(t=>t.status === "active");
      if (!token) { showToast("Check in a vehicle first to create an active QR for this scenario."); return; }
      const record = getStudent(token.studentId);
      tokenField.value = token.token; plateField.value = record?.vehicle.plate === "00X-000.00" ? "00X-000.00" : "00X-000.00";
    }
    showToast("Demo values loaded. Submit to record the blocked attempt.");
  }
  function exportEvents() {
    const rows = [["timestamp","event","student_id","student_name","plate","result","details"], ...state.events.map(event=>{ const student=getStudent(event.studentId); return [event.at,event.type,event.studentId,student?.name||"",student?.vehicle.plate||"",event.result,event.detail]; })];
    const csv = rows.map(row=>row.map(value=>`"${String(value??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    const link = document.createElement("a"); link.href=url; link.download="unipark-activity-demo.csv"; link.click(); URL.revokeObjectURL(url);
    showToast("Activity log exported as CSV.");
  }
  function handleClick(event) {
    if (event.target.classList.contains("modal-backdrop")) { pendingReview=null; render(); return; }
    const target = event.target.closest("button,[data-action]");
    if (!target) return;
    if (target.dataset.nav) { setView(target.dataset.nav); return; }
    if (target.dataset.adminTab) { state.adminTab=target.dataset.adminTab; state.view=target.dataset.adminTab === "overview" ? "admin" : target.dataset.adminTab; save(); render(); return; }
    if (target.dataset.review) { pendingReview={studentId:target.dataset.student,decision:target.dataset.review}; render(); return; }
    if (target.dataset.switchStudent) { state.currentUserId=target.dataset.switchStudent; state.view="dashboard"; save(); render(); return; }
    if (target.dataset.scenario) { loadScenario(target.dataset.scenario); return; }
    const action=target.dataset.action;
    if (action === "confirm-review" && pendingReview) { reviewStudent(pendingReview.studentId,pendingReview.decision); return; }
    if (action === "cancel-review") { pendingReview=null; render(); return; }
    if (action === "camera-toggle") { cameraToggle(); return; }
    if (action === "refresh-token") {
      const student=getStudent();
      if (!student || student.status!=="approved" || student.vehicle.status!=="Parked on campus") { showToast("Check in an approved vehicle before requesting an exit pass."); return; }
      createToken(student); save(); render(); showToast("A new QR pass is ready and expires in 3 minutes."); return;
    }
    if (action === "copy-token") { navigator.clipboard?.writeText(target.dataset.token).then(()=>showToast("QR token copied."),()=>showToast("Select and copy the token manually.")); return; }
    if (action === "export-events") { exportEvents(); return; }
    if (action === "show-signup") { state.authView="signup"; state.signupError=""; render(); return; }
    if (action === "show-login") { state.authView="login"; state.loginError=""; render(); return; }
    if (action === "logout") { stopCamera(); state.sessionUserId=null; state.loginError=""; state.view="dashboard"; save(); render(); return; }
    if (action === "reset-demo") {
      if (!window.confirm("Restore the original UniPark AI sample data? This clears demo changes saved in this browser.")) return;
      stopCamera(); state=structuredClone(seed); localStorage.removeItem(STORE_KEY); save(); render(); showToast("Original demo data restored."); return;
    }
  }
  function handleSubmit(event) {
    event.preventDefault();
    if (event.target.id === "login-form") {
      const form=event.target, data=new FormData(form), loginRole=String(data.get("role")), email=String(data.get("email")).trim().toLowerCase(), password=String(data.get("password"));
      state.loginRole=loginRole; state.loginEmail=email; state.loginError="";
      withLoading(form,"Signing in…",async()=>{
        try {
          let userId=null, validPassword=false;
          if(loginRole==="student") {
            const student=state.students.find(item=>item.email.toLowerCase()===email);
            if(student) { userId=student.id; validPassword=student.passwordHash ? await hashPassword(password,student.passwordSalt||"")===student.passwordHash : password==="student123"; }
          } else if(loginRole==="guard"&&email==="guard@unipark.edu") { userId="guard"; validPassword=password==="guard123"; }
          else if(loginRole==="admin"&&email==="admin@unipark.edu") { userId="admin"; validPassword=password==="admin123"; }
          if(!userId||!validPassword) { state.loginError="The role, email, or password does not match an account."; render(); return; }
          state.currentUserId=userId; state.sessionUserId=userId; state.authView="login";
          const student=getStudent(userId); state.view=userId==="admin"?"admin":userId==="guard"?"guard":student?.vehicle.plate?"dashboard":"register";
          state.adminTab="overview"; save(); render(); showToast(`Signed in as ${loginRole==="guard"?"Security Guard":loginRole==="admin"?"School Admin":"Student"}.`);
        } catch(error) { state.loginError=error.message||"Could not verify this account."; render(); }
      }); return;
    }
    if (event.target.id === "signup-form") {
      const form=event.target, data=new FormData(form);
      const values={name:String(data.get("name")).trim(),studentId:String(data.get("studentId")).trim().toUpperCase(),email:String(data.get("email")).trim().toLowerCase(),password:String(data.get("password")),confirm:String(data.get("confirmPassword"))};
      if(values.password.length<8) { state.signupError="Use a password with at least 8 characters."; render(); return; }
      if(values.password!==values.confirm) { state.signupError="The passwords do not match."; render(); return; }
      if(state.students.some(student=>student.id.toUpperCase()===values.studentId||student.email.toLowerCase()===values.email)) { state.signupError="That student ID or email already has an account. Try signing in instead."; render(); return; }
      state.signupError="";
      withLoading(form,"Creating your account…",async()=>{
        try {
          const saltBytes=new Uint8Array(16); window.crypto.getRandomValues(saltBytes); const passwordSalt=Array.from(saltBytes,byte=>byte.toString(16).padStart(2,"0")).join("");
          const passwordHash=await hashPassword(values.password,passwordSalt);
          const student={id:values.studentId,name:values.name,email:values.email,status:"pending",submittedAt:new Date().toISOString(),approvedAt:null,passwordHash,passwordSalt,vehicle:{plate:"",type:"Motorcycle",make:"",color:"",status:"Outside campus",lastCheckin:null,lastCheckout:null},documents:[]};
          state.students.push(student); state.currentUserId=student.id; state.sessionUserId=student.id; state.authView="login"; state.loginRole="student"; state.loginEmail=student.email; state.view="register";
          addEvent("application",student.id,"Student account created","Vehicle details are required before admin review.");
          save(); render(); showToast("Account created. Complete your vehicle profile next.");
        } catch(error) { state.signupError=error.message||"Could not create the account."; render(); }
      }); return;
    }
    if (event.target.id === "checkin-form") {
      const form=event.target, plate=new FormData(form).get("plate");
      withLoading(form,"Reading gate camera…",()=>{const result=doCheckin(plate);render();showToast(result.message);}); return;
    }
    if (event.target.id === "checkout-form") {
      const form=event.target, formData=new FormData(form), token=formData.get("token"), plate=formData.get("plate");
      withLoading(form,"Checking token & plate…",()=>{
        const result=doCheckout(token,plate); state.scannedToken=""; render();
        const container=document.querySelector("#checkout-result");
        if (container) container.innerHTML=`<div class="result-box ${result.ok?"result-success":"result-error"}"><div class="result-title">${esc(result.title)}</div>${esc(result.message)}</div>`;
      });
      return;
    }
    if (event.target.id === "registration-form") {
      const form=event.target;
      const data=new FormData(form);
      const files=Array.from(form.querySelectorAll('input[type="file"]')).map(input=>input.files[0]?.name).filter(Boolean);
      const values={name:String(data.get("name")).trim(),studentId:String(data.get("studentId")).trim().toUpperCase(),email:String(data.get("email")).trim(),plate:String(data.get("plate")).trim().toUpperCase(),vehicleType:String(data.get("vehicleType")),make:String(data.get("make")).trim(),color:String(data.get("color")).trim()};
      withLoading(form,"Submitting application…",()=>{
        const existing=state.students.find(student=>student.id===values.studentId);
        const record={id:values.studentId,name:values.name,email:values.email,status:"pending",submittedAt:new Date().toISOString(),approvedAt:null,vehicle:{plate:values.plate,type:values.vehicleType,make:values.make,color:values.color,status:"Outside campus",lastCheckin:null,lastCheckout:null},documents:files.length?files:["Student ID image selected","Registration image selected","Plate image selected"]};
        if(existing){record.vehicle.status=existing.vehicle.status;record.vehicle.lastCheckin=existing.vehicle.lastCheckin;record.vehicle.lastCheckout=existing.vehicle.lastCheckout;record.passwordHash=existing.passwordHash;record.passwordSalt=existing.passwordSalt;state.students[state.students.indexOf(existing)]=record;}else state.students.push(record);
        state.currentUserId=values.studentId;state.sessionUserId=values.studentId;state.view="dashboard";addEvent("application",values.studentId,"Application submitted","Vehicle verification is waiting for admin review.");save();render();showToast("Application submitted. Check back after admin review.");
      });
    }
  }
  function handleChange(event) {
    if (event.target.matches("[data-scenario]") || ["student-search","student-filter","vehicle-filter"].includes(event.target.id)) filterStudentTable();
    if (["activity-search","event-filter"].includes(event.target.id)) filterEventTable();
    if (event.target.matches('input[type="file"]')) {
      const file=event.target.files?.[0];
      const label=document.querySelector(`[data-file-label="${event.target.id}"]`);
      if (label) label.textContent=file ? `${file.name} · selected locally` : "Choose a sample image (JPG or PNG)";
    }
    if (event.target.id === "guard-student") {
      const student=getStudent(event.target.value);
      const plate=document.querySelector("#camera-plate");
      if (student && plate) plate.value=student.vehicle.plate;
    }
  }

  // Compact offline QR encoder: QR Code Model 2, version 2-L, byte mode.
  // The payload is an opaque random token, never profile information.
  function qrCode(text) {
    const size=25, dataWords=34, eccWords=10;
    const bytes=Array.from(new TextEncoder().encode(text));
    const bits=[];
    const append=(value,length)=>{ for(let i=length-1;i>=0;i--) bits.push((value>>>i)&1); };
    append(0b0100,4); append(bytes.length,8); bytes.forEach(byte=>append(byte,8));
    const capacity=dataWords*8;
    for(let i=0;i<Math.min(4,capacity-bits.length);i++) bits.push(0);
    while(bits.length%8) bits.push(0);
    const data=[];
    for(let i=0;i<bits.length;i+=8){let value=0;for(let j=0;j<8;j++)value=(value<<1)|bits[i+j];data.push(value);}
    for(let pad=0;data.length<dataWords;pad++) data.push(pad%2?0x11:0xec);
    const gfMul=(x,y)=>{let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11d);if((y>>>i)&1)z^=x;}return z;};
    const polyMul=(a,b)=>{const result=Array(a.length+b.length-1).fill(0);a.forEach((x,i)=>b.forEach((y,j)=>result[i+j]^=gfMul(x,y)));return result;};
    let generator=[1],root=1;for(let i=0;i<eccWords;i++){generator=polyMul(generator,[1,root]);root=gfMul(root,2);}
    const message=data.concat(Array(eccWords).fill(0));
    for(let i=0;i<data.length;i++){const factor=message[i];if(factor)for(let j=0;j<generator.length;j++)message[i+j]^=gfMul(generator[j],factor);}
    const codewords=data.concat(message.slice(data.length));
    const grid=Array.from({length:size},()=>Array(size).fill(false));
    const fn=Array.from({length:size},()=>Array(size).fill(false));
    const setFn=(x,y,dark)=>{if(x<0||y<0||x>=size||y>=size)return;grid[y][x]=Boolean(dark);fn[y][x]=true;};
    const finder=(cx,cy)=>{for(let dy=-1;dy<=7;dy++)for(let dx=-1;dx<=7;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=size||y>=size)continue;const inside=dx>=0&&dx<=6&&dy>=0&&dy<=6;const dark=inside&&(dx===0||dx===6||dy===0||dy===6||(dx>=2&&dx<=4&&dy>=2&&dy<=4));setFn(x,y,dark);}};
    finder(3,3);finder(size-4,3);finder(3,size-4);
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)setFn(18+dx,18+dy,Math.max(Math.abs(dx),Math.abs(dy))===2||(dx===0&&dy===0));
    for(let i=8;i<size-8;i++){setFn(i,6,i%2===0);setFn(6,i,i%2===0);}
    // Reserve both copies of the format bits and the fixed dark module.
    for(let i=0;i<=5;i++)setFn(8,i,false);setFn(8,7,false);setFn(8,8,false);setFn(7,8,false);for(let i=9;i<15;i++)setFn(14-i,8,false);
    for(let i=0;i<8;i++)setFn(size-1-i,8,false);for(let i=8;i<15;i++)setFn(8,size-15+i,false);setFn(8,size-8,true);
    const stream=[];codewords.forEach(byte=>{for(let bit=7;bit>=0;bit--)stream.push((byte>>>bit)&1);});
    let index=0, upward=true;
    for(let right=size-1;right>=1;right-=2){if(right===6)right--;for(let vert=0;vert<size;vert++){const y=upward?size-1-vert:vert;for(let j=0;j<2;j++){const x=right-j;if(!fn[y][x]){let dark=index<stream.length?stream[index++]===1:false;if((x+y)%2===0)dark=!dark;grid[y][x]=dark;}}}upward=!upward;}
    const formatData=(1<<3)|0; // Error correction L, mask 0.
    let rem=formatData;for(let i=0;i<10;i++)rem=(rem<<1)^(((rem>>>9)&1)*0x537);
    const format=((formatData<<10)|rem)^0x5412;
    const bitAt=i=>((format>>>i)&1)!==0;
    for(let i=0;i<=5;i++)grid[i][8]=bitAt(i);grid[7][8]=bitAt(6);grid[8][8]=bitAt(7);grid[8][7]=bitAt(8);for(let i=9;i<15;i++)grid[8][14-i]=bitAt(i);
    for(let i=0;i<8;i++)grid[8][size-1-i]=bitAt(i);for(let i=8;i<15;i++)grid[size-15+i][8]=bitAt(i);grid[size-8][8]=true;
    return grid;
  }
  function drawQr(text) {
    const canvas=document.querySelector("#student-qr");if(!canvas)return;
    const ctx=canvas.getContext("2d");const matrix=qrCode(text);const scale=4.7;const offset=(canvas.width-matrix.length*scale)/2;
    ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#112747";
    matrix.forEach((row,y)=>row.forEach((dark,x)=>{if(dark)ctx.fillRect(offset+x*scale,offset+y*scale,scale,scale);}));
  }

  root.addEventListener("click",handleClick);
  root.addEventListener("submit",handleSubmit);
  root.addEventListener("change",handleChange);
  root.addEventListener("input",event=>{if(event.target.id==="student-search")filterStudentTable();if(event.target.id==="activity-search")filterEventTable();});
  render();
})();
