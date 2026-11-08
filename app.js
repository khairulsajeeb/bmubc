(function () {
  "use strict";

  const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
  const STORAGE_KEY = "bloodlink-demo-database-v1";
  const routes = ["/", "/request-blood", "/be-donor", "/blog", "/about", "/admin"];
  const navItems = [
    { path: "/", label: "Home", icon: "house" },
    { path: "/be-donor", label: "Become a donor", icon: "heart" },
    { path: "/request-blood", label: "Request blood", icon: "droplets" },
    { path: "/blog", label: "Health blog", icon: "newspaper" },
    { path: "/about", label: "About", icon: "heart-handshake" }
  ];
  const slides = [
    { tag: "Every drop counts", title: "Be the reason someone gets another tomorrow.", text: "One donation can help save up to three lives. Join a caring community of local blood donors.", primary: "Become a donor", primaryPath: "/be-donor", secondary: "Request blood", secondaryPath: "/request-blood", stat: "3 lives", caption: "can be helped by one donation", image: "img/donation1.jpeg" },
    { tag: "A little time. A lifetime of impact.", title: "Your blood type could be someone's lifeline.", text: "Register as a donor today and be there when your community needs you most.", primary: "Register to donate", primaryPath: "/be-donor", secondary: "Learn more", secondaryPath: "/about", stat: "Every 2 sec", caption: "someone needs blood", image: "img/donation2.jpeg" },
    { tag: "Help is closer than you think", title: "Your willingness to help can make a difference.", text: "Register as a donor and be there when someone in your community needs you.", primary: "Become a donor", primaryPath: "/be-donor", secondary: "How it works", secondaryPath: "/about", stat: "Together", caption: "we can make a difference", image: "img/donation3.jpeg" }
  ];
  const icon = (name, cls) => `<i data-lucide="${name}"${cls ? ` class="${cls}"` : ""}></i>`;
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const safeImageUrl = (value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (_) {
      return "";
    }
  };
  const dateLabel = (timestamp) => timestamp ? new Date(Number(timestamp)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Recently";
  const byRecent = (items) => Object.values(items || {}).sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  const demoMode = !window.BLOOD_DONATION_FIREBASE_CONFIG;
  const state = {
    route: normalizeRoute(location.hash.startsWith("#/") ? location.hash.slice(1) : location.pathname),
    slide: 0,
    bloodGroup: "",
    adminTab: "applications",
    adminUser: null,
    demoAdmin: false,
    data: { blood_requests: {}, donors: {}, donor_applications: {}, blogs: {} },
    modal: null,
    loading: !demoMode
  };
  let database = null;
  let auth = null;
  let carouselTimer = null;
  let adminSubscriptions = [];

  function stopAdminListeners() {
    adminSubscriptions.forEach(({ ref, callback }) => ref.off("value", callback));
    adminSubscriptions = [];
  }

  function startAdminListeners() {
    ["donors", "donor_applications"].forEach((node) => {
      const ref = database.ref(node);
      const callback = (snapshot) => {
        state.data[node] = snapshot.val() || {};
        render();
      };
      ref.on("value", callback, (error) => {
        console.error(`Firebase read failed for ${node}.`, error);
        state.data[node] = {};
        render();
        showToast(`Could not load ${node.replace("_", " ")}. Check admin database rules.`, true);
      });
      adminSubscriptions.push({ ref, callback });
    });
  }

  function normalizeRoute(path) {
    const clean = path.replace(/\/+$/, "") || "/";
    if (clean === "/donors") return "/be-donor";
    return routes.includes(clean) ? clean : "/";
  }

  function readDemoData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && typeof saved === "object") state.data = Object.assign(state.data, saved);
    } catch (error) {
      console.error("Could not read BloodLink demo data.", error);
      showToast("Saved demo data could not be loaded.", true);
    }
  }

  function persistDemoData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    } catch (error) {
      console.error("Could not save BloodLink demo data.", error);
      showToast("Changes could not be saved in this browser.", true);
      throw error;
    }
  }

  function initializeFirebase() {
    const config = window.BLOOD_DONATION_FIREBASE_CONFIG;
    if (!config) {
      readDemoData();
      return;
    }
    if (!config.apiKey || !config.databaseURL || !config.projectId || !config.authDomain) {
      state.loading = false;
      render();
      showToast("Firebase config is incomplete. Check firebase-config.js.", true);
      return;
    }
    try {
      const app = firebase.initializeApp(config);
      database = firebase.database(app);
      auth = firebase.auth(app);
      ["blood_requests", "blogs"].forEach((node) => {
        database.ref(node).on("value", (snapshot) => {
          state.data[node] = snapshot.val() || {};
          state.loading = false;
          render();
        }, (error) => {
          console.error(`Firebase read failed for ${node}.`, error);
          state.loading = false;
          render();
          showToast(`Could not load ${node.replace("_", " ")}. Check database rules.`, true);
        });
      });
      auth.onAuthStateChanged(async (user) => {
        stopAdminListeners();
        state.adminUser = null;
        state.data.donors = {};
        state.data.donor_applications = {};
        if (!user) {
          state.demoAdmin = false;
          render();
          return;
        }
        try {
          if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
          const adminSnapshot = await database.ref(`admins/${user.uid}`).once("value");
          if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
          if (adminSnapshot.val() !== true) {
            render();
            showToast("This account is not authorized for the admin dashboard.", true);
            return;
          }
          state.adminUser = user;
          startAdminListeners();
          render();
        } catch (error) {
          console.error("Could not verify admin access.", error);
          render();
          showToast("Could not verify administrator access.", true);
        }
      });
    } catch (error) {
      console.error("Firebase could not be initialized.", error);
      state.loading = false;
      render();
      showToast("Firebase could not start. Check your configuration.", true);
    }
  }

  function showToast(message, isError) {
    const region = document.getElementById("toast-region");
    if (!region) return;
    const toast = document.createElement("div");
    toast.className = `toast${isError ? " error" : ""}`;
    toast.innerHTML = `${icon(isError ? "circle-alert" : "circle-check")}<span>${escapeHtml(message)}</span>`;
    region.appendChild(toast);
    if (window.lucide) lucide.createIcons({ nodes: [toast] });
    window.setTimeout(() => toast.remove(), 3900);
  }

  function renderIcons() {
    if (window.lucide) lucide.createIcons();
  }

  function link(path, label, cls) {
    return `<a class="${cls || ""}" href="#${path}" data-route="${path}">${label}</a>`;
  }

  function header() {
    return `<header class="topbar"><div class="topbar-inner">
      ${link("/", `<span class="brand-mark">${icon("droplets")}</span><span>BloodLink</span>`, "brand")}
      <nav class="nav-links" aria-label="Main navigation">${navItems.map((item) => link(item.path, escapeHtml(item.label), state.route === item.path ? "active" : "")).join("")}</nav>
      <div class="nav-actions">
        ${link("/admin", `${icon("shield-check")} Admin`, "btn btn-outline btn-small desktop-action")}
        ${link("/admin", `${icon("shield-check")} Admin`, "btn btn-outline btn-small mobile-action")}
      </div>
    </div></header>
    <nav class="mobile-nav" aria-label="Mobile navigation">${[
      { path: "/", label: "Home", icon: "house" },
      { path: "/be-donor", label: "Be a donor", icon: "heart" },
      { path: "/request-blood", label: "Request", icon: "droplets" },
      { path: "/blog", label: "Blog", icon: "newspaper" },
      { path: "/about", label: "About", icon: "circle-help" }
    ].map((item) => link(item.path, `${icon(item.icon)}<span>${item.label}</span>`, state.route === item.path ? "active" : "")).join("")}</nav>`;
  }

  function footer() {
    return `<footer class="footer"><div class="footer-inner">
      ${link("/", `<span class="brand-mark">${icon("droplets")}</span><span>BloodLink</span>`, "brand")}
      <span>Connecting generous donors with people who need them. Every drop matters.</span>
      <span>© ${new Date().getFullYear()} BloodLink</span>
    </div></footer>`;
  }

  function hero() {
    const slide = slides[state.slide];
    return `<section class="hero">
      <img class="hero-background" src="${escapeHtml(slide.image)}" alt="" aria-hidden="true">
      <div class="hero-copy"><span class="eyebrow">${icon("heart-pulse")}${escapeHtml(slide.tag)}</span>
        <h1>${escapeHtml(slide.title)}</h1><p>${escapeHtml(slide.text)}</p>
        <div class="hero-actions">${link(slide.primaryPath, `${escapeHtml(slide.primary)} ${icon("arrow-up-right")}`, "btn")}
          ${link(slide.secondaryPath, `${escapeHtml(slide.secondary)} ${icon("arrow-right")}`, "btn btn-outline")}</div>
      </div>
      <div class="floating-stat"><strong>${escapeHtml(slide.stat)}</strong><span>${escapeHtml(slide.caption)}</span></div>
      <div class="carousel-dots">${slides.map((_, index) => `<button class="carousel-dot${index === state.slide ? " active" : ""}" type="button" aria-label="Show slide ${index + 1}" data-slide="${index}"></button>`).join("")}</div>
    </section>`;
  }

  function sectionHead(eyebrow, title, description, morePath, moreLabel) {
    return `<div class="section-head"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2>${description ? `<p>${escapeHtml(description)}</p>` : ""}</div>${morePath ? link(morePath, `${escapeHtml(moreLabel)} ${icon("arrow-right")}`, "btn btn-outline btn-small") : ""}</div>`;
  }

  function requestCard(request) {
    const status = String(request.status || "Pending");
    const statusClass = status.toLowerCase();
    return `<article class="request-card"><div class="request-top"><span class="blood-badge">${escapeHtml(request.bloodGroup)}</span><span class="status status-${escapeHtml(statusClass)}">${escapeHtml(status)}</span></div>
      <h3>${escapeHtml(request.patientName)}</h3><p>${escapeHtml(request.note || "A local patient needs a blood donor. Please share if you can help.")}</p>
      <div class="request-meta">${icon("map-pin")}<span>${escapeHtml(request.hospitalName)}</span></div>
      <div class="request-meta">${icon("calendar-days")}<span>${escapeHtml(dateLabel(request.timestamp))}</span></div></article>`;
  }

  function homePage() {
    const actions = [
      { path: "/request-blood", icon: "siren", title: "Request blood", text: "Get connected to a local donor when time matters." },
      { path: "/be-donor", icon: "heart-handshake", title: "Become a donor", text: "Register today and be someone's helping hand." },
      { path: "/about", icon: "clipboard-check", title: "Donor eligibility", text: "Learn about donation requirements and the process." },
      { path: "/blog", icon: "book-open", title: "Blood health blog", text: "Read helpful guides about blood and donation." }
    ];
    const benefits = [
      { icon: "heart-pulse", title: "A gift that saves lives", text: "A single blood donation can help up to three people in need." },
      { icon: "clipboard-check", title: "Know your health", text: "Donors receive a basic health screening before each donation." },
      { icon: "users-round", title: "Stronger communities", text: "Local donors make timely, trusted help possible for neighbors." }
    ];
    const active = byRecent(state.data.blood_requests).filter((request) => ["pending", "approved"].includes(String(request.status || "").toLowerCase())).slice(0, 3);
    return `${hero()}
      <section class="section">${sectionHead("Take action", "A small act can mean everything", "Choose how you would like to help today.")}
        <div class="action-grid">${actions.map((item) => link(item.path, `<span class="action-icon">${icon(item.icon)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p>`, "action-card")).join("")}</div>
      </section>
      <section class="section">${sectionHead("Why donate", "Good for you. Life-changing for someone.", "Blood donation is a simple act of care that brings communities closer.")}
        <div class="benefit-grid">${benefits.map((item) => `<article class="benefit-card"><span class="action-icon">${icon(item.icon)}</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></div></article>`).join("")}</div>
      </section>
      <section class="section">${sectionHead("Help needed now", "Latest emergency requests", "These requests are currently looking for a helping donor.", "/request-blood", "Make a request")}
        ${active.length ? `<div class="emergency-list">${active.map(requestCard).join("")}</div>` : `<div class="empty">${icon("heart-pulse")}No active blood requests right now. Check back soon or register as a donor.</div>`}
      </section>`;
  }

  function bloodSelector(selected, name) {
    return `<div class="blood-options" role="group" aria-label="Choose blood group">${BLOOD_GROUPS.map((group) => `<button type="button" class="blood-option${selected === group ? " selected" : ""}" data-blood="${group}" data-name="${name}" aria-pressed="${selected === group}">${group}</button>`).join("")}</div>`;
  }

  function formField(label, name, placeholder, type, required, full) {
    const inputType = type || "text";
    const requiredAttr = required ? " required" : "";
    return `<div class="field${full ? " full" : ""}"><label for="${name}">${escapeHtml(label)}${required ? " *" : ""}</label>${inputType === "textarea" ? `<textarea id="${name}" name="${name}" placeholder="${escapeHtml(placeholder)}"${requiredAttr}></textarea>` : `<input id="${name}" name="${name}" type="${inputType}" placeholder="${escapeHtml(placeholder)}"${requiredAttr}${inputType === "tel" ? ' autocomplete="tel"' : ""}>`}</div>`;
  }

  function requestPage() {
    return `<div class="page-heading"><span class="eyebrow">${icon("siren")}Emergency support</span><h1>Request blood</h1><p>Share the details below so local donors can find your request. Please make sure the contact number is reachable.</p></div>
      <div class="split-layout"><section class="panel"><h2>Blood request details</h2><p class="panel-intro">Fields marked with * are required. Your request will appear as pending for review.</p>
        <form id="request-form"><div class="form-grid">
          ${formField("Patient name", "patientName", "Name of the patient", "text", true)}
          <div class="field"><label>Required blood group *</label>${bloodSelector(state.bloodGroup, "request")}</div>
          ${formField("Hospital / location", "hospitalName", "Hospital name and area", "text", true, true)}
          ${formField("Contact phone number", "contactNumber", "+1 555 000 0000", "tel", true)}
          ${formField("Urgency notes", "note", "When is the blood needed? Any helpful details...", "textarea", false, true)}
          <div class="field full"><button class="btn btn-block" type="submit">${icon("send")} Submit blood request</button><span class="field-help">Only share information you are comfortable making visible to potential donors.</span></div>
        </div></form></section>
        <aside><div class="info-card"><span class="eyebrow" style="color:#ffd4d1">${icon("heart-pulse")}You are not alone</span><h3>Help can be closer than you think.</h3><p>Once submitted, your request is shared with the BloodLink community. Keep your phone nearby so a donor can reach you.</p>${link("/be-donor", `Become a donor ${icon("arrow-right")}`, "btn")}</div>
          <div class="info-points"><div class="info-point">${icon("shield-check")}Your request starts as pending and can be reviewed by an administrator.</div><div class="info-point">${icon("phone")}Double-check your phone number before submitting.</div><div class="info-point">${icon("clock-3")}If this is a life-threatening emergency, contact local emergency services immediately.</div></div>
        </aside></div>`;
  }

  function donorPage() {
    return `<div class="page-heading"><span class="eyebrow">${icon("heart-handshake")}Join the community</span><h1>Become a donor</h1><p>Your willingness to help can make all the difference. Register your details and an administrator will review your application.</p></div>
      <div class="split-layout"><section class="panel"><h2>Donor registration</h2><p class="panel-intro">Your application will be reviewed before your profile appears in the verified donor directory.</p>
        <form id="donor-form"><div class="form-grid">${formField("Full name", "fullName", "Your full name", "text", true)}
          <div class="field"><label>Blood group *</label>${bloodSelector(state.bloodGroup, "donor")}</div>
          ${formField("Phone number", "phoneNumber", "+1 555 000 0000", "tel", true)}
          ${formField("City / area", "location", "City, neighborhood or area", "text", true)}
          <div class="field full"><button class="btn btn-block" type="submit">${icon("heart")} Send donor application</button><span class="field-help">By registering, you agree to be contacted by people seeking blood in your area.</span></div>
        </div></form></section>
        <aside><div class="info-card"><span class="eyebrow" style="color:#ffd4d1">${icon("droplets")}Be someone's hero</span><h3>Your next donation could change a life.</h3><p>Donors are one of the most important parts of a healthy and prepared community. Thank you for stepping up.</p>${link("/about", `Donation FAQs ${icon("arrow-right")}`, "btn")}</div><div class="info-points"><div class="info-point">${icon("check")}Share accurate contact and location details.</div><div class="info-point">${icon("check")}Your information is listed only after approval.</div><div class="info-point">${icon("check")}A recipient should always confirm eligibility with a healthcare professional.</div></div></aside>
      </div>`;
  }

  function blogCard(article) {
    const cover = safeImageUrl(article.coverImageUrl);
    const snippet = String(article.body || "").replace(/\s+/g, " ").slice(0, 135);
    return `<article class="article-card">${cover ? `<img class="article-image" src="${escapeHtml(cover)}" alt="" loading="lazy">` : `<div class="article-image" style="display:grid;place-items:center;color:#d32f2f">${icon("book-open")}</div>`}
      <div class="article-content"><span class="article-date">${escapeHtml(dateLabel(article.timestamp))}</span><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(snippet)}${String(article.body || "").length > 135 ? "…" : ""}</p>
      <div class="article-byline"><span>By ${escapeHtml(article.author || "Admin")}</span><button type="button" class="article-read" data-read-blog="${escapeHtml(article.id)}">Read article ${icon("arrow-right")}</button></div></div>
    </article>`;
  }

  function blogPage() {
    const articles = byRecent(state.data.blogs);
    return `<div class="page-heading"><span class="eyebrow">${icon("book-open")}Learn and share</span><h1>Blood health blog</h1><p>Clear, helpful reads about blood donation, donor wellbeing, and the difference a community can make.</p></div>
      ${articles.length ? `<div class="article-grid">${articles.map(blogCard).join("")}</div>` : `<div class="empty">${icon("newspaper")}${state.loading ? "Loading articles..." : "No articles published yet. Please check back soon."}</div>`}`;
  }

  function aboutPage() {
    const faqs = [
      ["Who can donate blood?", "Eligibility varies by country and individual health. In general, donors should feel well and meet local age, weight, and health requirements. A qualified donation center will screen you before donation."],
      ["How often can I donate?", "The safe interval depends on the type of donation and local guidance. Always follow the advice of your donation center and healthcare professional."],
      ["What happens after I register as a donor?", "An administrator reviews your application. If approved, your profile appears in the directory so people can reach out to you directly."],
      ["What should I do in a medical emergency?", "Call your local emergency services and contact the hospital blood bank. BloodLink helps connect people but is not a substitute for emergency or medical care."],
      ["Is blood donation safe?", "Donation is performed by trained staff using sterile, single-use supplies. Talk with a healthcare professional or donation center about your personal eligibility."]
    ];
    return `<section class="about-hero"><span class="eyebrow" style="color:#ffd5d1">${icon("heart-handshake")}Our mission</span><h1>A caring community, ready when every moment matters.</h1><p>BloodLink helps bring people who need blood closer to generous local donors. We believe timely connections, clear information, and small acts of kindness can help build healthier communities.</p></section>
      <section class="section">${sectionHead("Our vision", "Making it easier to show up for one another", "We connect patients and families with nearby donors, make donor registration simple, and share practical blood health information. Our goal is a more connected community where people can ask for help and offer it with care.")}
        <div class="contact-grid"><article class="contact-card"><span class="action-icon">${icon("siren")}</span><h3>Emergency help</h3><p>For immediate medical emergencies, call your local emergency number and contact the hospital blood bank.</p></article>
          <article class="contact-card"><span class="action-icon">${icon("mail")}</span><h3>Contact BloodLink</h3><p>For platform help, reach out to your local BloodLink administrator.</p></article>
          <article class="contact-card"><span class="action-icon">${icon("shield-check")}</span><h3>Privacy & care</h3><p>Share only information needed to coordinate a donation. Donors and recipients should verify details with medical staff.</p></article>
        </div>
      </section>
      <section class="section">${sectionHead("Good to know", "Frequently asked questions")}
        <div class="faq-list">${faqs.map(([question, answer]) => `<article class="faq-item"><h3>${escapeHtml(question)}</h3><p>${escapeHtml(answer)}</p></article>`).join("")}</div>
      </section>`;
  }

  function isAdmin() {
    return Boolean(state.adminUser || state.demoAdmin);
  }

  function adminPage() {
    if (!isAdmin()) return `<div class="admin-login"><section class="panel login-panel"><span class="login-mark">${icon("shield-check")}</span><h1>Admin portal</h1><p>Sign in to review donor applications, manage emergency requests, and publish health articles.</p>
      ${demoMode ? `<div class="demo-note">Preview mode is active: data is saved only in this browser. Sign in with Firebase Admin once you add your project config to leave demo mode.</div>` : ""}
      <form id="admin-login-form"><div class="form-grid" style="grid-template-columns:1fr">${formField("Admin email", "email", "admin@example.com", "email", true)}${formField("Password", "password", "Enter your password", "password", true)}
        <div class="field full"><button class="btn btn-block" type="submit">${icon("log-in")} Sign in securely</button></div>
      </div></form>${demoMode ? `<button class="btn btn-outline btn-block" style="margin-top:10px" type="button" data-demo-admin>${icon("eye")} Open local demo dashboard</button>` : ""}
    </section></div>`;

    const tabs = [
      ["applications", "user-round-check", "Donor applications"],
      ["donors", "users-round", "Donor directory"],
      ["requests", "droplets", "Blood requests"],
      ["blogs", "newspaper", "Manage blogs"],
      ["add-donor", "user-plus", "Add a donor"]
    ];
    const content = state.adminTab === "applications" ? adminApplications() : state.adminTab === "donors" ? adminDonors() : state.adminTab === "requests" ? adminRequests() : state.adminTab === "blogs" ? adminBlogs() : adminAddDonor();
    return `<div class="page-heading"><span class="eyebrow">${icon("shield-check")}BloodLink management</span><h1>Admin dashboard</h1><p>Manage donor listings, emergency requests, and community health articles.</p></div>
      <div class="stats-grid">${[
        ["Verified donors", Object.keys(state.data.donors).length, "users-round"],
        ["Pending applications", Object.values(state.data.donor_applications).filter((item) => item.status === "pending").length, "user-round-check"],
        ["Open requests", Object.values(state.data.blood_requests).filter((item) => ["pending", "approved"].includes(String(item.status || "").toLowerCase())).length, "droplets"],
        ["Published articles", Object.keys(state.data.blogs).length, "newspaper"]
      ].map(([label, count]) => `<div class="stat-card"><span>${escapeHtml(label)}</span><strong>${count}</strong></div>`).join("")}</div>
      <div class="admin-layout"><nav class="admin-sidebar" aria-label="Admin sections">${tabs.map(([key, iconName, label]) => `<button type="button" class="admin-tab${state.adminTab === key ? " active" : ""}" data-admin-tab="${key}">${icon(iconName)}${label}</button>`).join("")}</nav>
        <section class="admin-content"><div class="admin-title"><div><h2>${escapeHtml(tabs.find((tab) => tab[0] === state.adminTab)[2])}</h2><p>Changes are saved to ${demoMode ? "this browser's local demo data" : "Firebase Realtime Database"}.</p></div><button class="btn btn-outline btn-small" type="button" data-admin-logout>${icon("log-out")} Sign out</button></div>${content}</section>
      </div>`;
  }

  function adminApplications() {
    const applications = byRecent(state.data.donor_applications);
    if (!applications.length) return `<div class="empty">${icon("user-round-check")}No donor applications to review.</div>`;
    return `<div class="panel table-wrap"><table><thead><tr><th>Applicant</th><th>Blood group</th><th>Contact / area</th><th>Status</th><th>Action</th></tr></thead><tbody>${applications.map((application) => `<tr><td><strong>${escapeHtml(application.fullName)}</strong><br>${escapeHtml(dateLabel(application.timestamp))}</td><td><span class="blood-badge">${escapeHtml(application.bloodGroup)}</span></td><td>${escapeHtml(application.phoneNumber)}<br>${escapeHtml(application.location)}</td><td><span class="status status-${escapeHtml(application.status)}">${escapeHtml(application.status)}</span></td><td><div class="table-actions">${application.status === "pending" ? `<button class="btn btn-small" type="button" data-approve="${escapeHtml(application.id)}">Approve</button><button class="btn btn-danger btn-small" type="button" data-reject="${escapeHtml(application.id)}">Reject</button>` : "—"}</div></td></tr>`).join("")}</tbody></table></div>`;
  }

  function adminDonors() {
    const donors = byRecent(state.data.donors);
    if (!donors.length) return `<div class="empty">${icon("users-round")}No verified donors in the directory.</div>`;
    return `<div class="panel table-wrap"><table><thead><tr><th>Donor</th><th>Blood group</th><th>Phone number</th><th>Location</th><th>Added</th></tr></thead><tbody>${donors.map((donor) => `<tr><td><strong>${escapeHtml(donor.fullName)}</strong></td><td><span class="blood-badge">${escapeHtml(donor.bloodGroup)}</span></td><td>${escapeHtml(donor.phoneNumber)}</td><td>${escapeHtml(donor.location)}</td><td>${escapeHtml(dateLabel(donor.timestamp))}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function adminRequests() {
    const requests = byRecent(state.data.blood_requests);
    if (!requests.length) return `<div class="empty">${icon("droplets")}No blood requests have been submitted yet.</div>`;
    const statuses = ["Pending", "Approved", "Fulfilled", "Cancelled"];
    return `<div class="panel table-wrap"><table><thead><tr><th>Patient / group</th><th>Hospital / contact</th><th>Submitted</th><th>Status</th></tr></thead><tbody>${requests.map((request) => `<tr><td><strong>${escapeHtml(request.patientName)}</strong><br><span class="blood-badge">${escapeHtml(request.bloodGroup)}</span></td><td>${escapeHtml(request.hospitalName)}<br>${escapeHtml(request.contactNumber)}</td><td>${escapeHtml(dateLabel(request.timestamp))}</td><td><select class="field-status" aria-label="Change request status" data-request-status="${escapeHtml(request.id)}">${statuses.map((status) => `<option${status === request.status ? " selected" : ""}>${status}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>`;
  }

  function adminBlogs() {
    const articles = byRecent(state.data.blogs);
    return `<div class="panel"><h3>Publish an article</h3><p class="panel-intro">Share useful and responsible blood health information with your community.</p>
      <form id="blog-form"><div class="form-grid" style="grid-template-columns:1fr">${formField("Article title", "title", "A helpful, clear title", "text", true)}
        ${formField("Cover image URL", "coverImageUrl", "https://example.com/image.jpg", "url", false)}
        ${formField("Article body", "body", "Write your article...", "textarea", true, true)}
        <div class="field full"><button class="btn" type="submit">${icon("send")} Publish article</button></div>
      </div></form></div>
      <div style="height:16px"></div>${articles.length ? `<div class="panel"><h3>Published articles</h3><div class="table-wrap"><table><thead><tr><th>Article</th><th>Published</th><th>Action</th></tr></thead><tbody>${articles.map((article) => `<tr><td><strong>${escapeHtml(article.title)}</strong></td><td>${escapeHtml(dateLabel(article.timestamp))}</td><td><button class="btn btn-danger btn-small" type="button" data-delete-blog="${escapeHtml(article.id)}">Delete</button></td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
  }

  function adminAddDonor() {
    return `<div class="panel"><h3>Add a verified donor</h3><p class="panel-intro">Manually add a donor who has already been verified.</p>
      <form id="direct-donor-form"><div class="form-grid">
        ${formField("Full name", "fullName", "Donor name", "text", true)}
        <div class="field"><label>Blood group *</label>${bloodSelector(state.bloodGroup, "donor")}</div>
        ${formField("Phone number", "phoneNumber", "+1 555 000 0000", "tel", true)}
        ${formField("City / area", "location", "City, neighborhood or area", "text", true)}
        <div class="field full"><button class="btn" type="submit">${icon("user-plus")} Add verified donor</button></div>
      </div></form></div>`;
  }

  function modalMarkup() {
    if (!state.modal) return "";
    const article = state.data.blogs[state.modal];
    if (!article) return "";
    const cover = safeImageUrl(article.coverImageUrl);
    return `<div class="modal-backdrop" data-close-modal><article class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <button class="modal-close" type="button" aria-label="Close article" data-close-modal>${icon("x")}</button>
      <span class="eyebrow">${icon("book-open")}${escapeHtml(dateLabel(article.timestamp))} · By ${escapeHtml(article.author || "Admin")}</span>
      <h2 id="modal-title">${escapeHtml(article.title)}</h2>${cover ? `<img src="${escapeHtml(cover)}" alt="">` : ""}
      <div class="modal-body">${escapeHtml(article.body)}</div>
    </article></div>`;
  }

  function render() {
    const root = document.getElementById("app");
    let page;
    if (state.route === "/") page = homePage();
    else if (state.route === "/request-blood") page = requestPage();
    else if (state.route === "/be-donor") page = donorPage();
    else if (state.route === "/blog") page = blogPage();
    else if (state.route === "/about") page = aboutPage();
    else page = adminPage();
    root.innerHTML = `<div class="shell">${header()}<main class="main">${page}</main>${footer()}</div>${modalMarkup()}`;
    renderIcons();
    if (state.route === "/") startCarousel();
    else stopCarousel();
  }

  function startCarousel() {
    if (carouselTimer) return;
    carouselTimer = window.setInterval(() => {
      if (state.route !== "/") return;
      state.slide = (state.slide + 1) % slides.length;
      render();
    }, 6500);
  }
  function stopCarousel() {
    if (carouselTimer && state.route !== "/") {
      window.clearInterval(carouselTimer);
      carouselTimer = null;
    }
  }

  function navigate(path) {
    const next = normalizeRoute(path);
    if (location.hash !== `#${next}`) location.hash = next;
    state.modal = null;
    state.bloodGroup = "";
    if (state.route === next) {
      window.scrollTo(0, 0);
      render();
    }
  }

  function newId(node) {
    return database ? database.ref(node).push().key : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  async function saveRecord(node, record) {
    if (database) {
      const id = record.id || newId(node);
      await database.ref(`${node}/${id}`).set(Object.assign({}, record, { id }));
      return id;
    }
    const id = record.id || newId(node);
    state.data[node][id] = Object.assign({}, record, { id });
    persistDemoData();
    return id;
  }

  async function updateRecord(path, values) {
    if (database) {
      await database.ref(path).update(values);
      return;
    }
    const [node, id] = path.split("/");
    if (!state.data[node] || !state.data[node][id]) throw new Error("The requested record no longer exists.");
    Object.assign(state.data[node][id], values);
    persistDemoData();
  }

  async function removeRecord(path) {
    if (database) {
      await database.ref(path).remove();
      return;
    }
    const [node, id] = path.split("/");
    if (state.data[node]) delete state.data[node][id];
    persistDemoData();
  }

  async function approveApplication(id) {
    const application = state.data.donor_applications[id];
    if (!application) return showToast("This application could not be found.", true);
    const donor = {
      id,
      fullName: application.fullName,
      bloodGroup: application.bloodGroup,
      phoneNumber: application.phoneNumber,
      location: application.location,
      timestamp: Date.now()
    };
    try {
      if (database) {
        const updates = {};
        updates[`donors/${id}`] = donor;
        updates[`donor_applications/${id}/status`] = "approved";
        await database.ref().update(updates);
      } else {
        state.data.donors[id] = donor;
        state.data.donor_applications[id].status = "approved";
        persistDemoData();
        render();
      }
      showToast("Donor application approved and added to the directory.");
    } catch (error) {
      console.error("Could not approve donor application.", error);
      showToast("Could not approve application. Please try again.", true);
    }
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (!form.reportValidity()) return;

    if (form.id === "request-form" || form.id === "donor-form" || form.id === "direct-donor-form") {
      const group = state.bloodGroup;
      if (!BLOOD_GROUPS.includes(group)) return showToast("Please choose a blood group.", true);
      const values = formData(form);
      const isRequest = form.id === "request-form";
      const record = isRequest ? {
        patientName: values.patientName.trim(),
        bloodGroup: group,
        hospitalName: values.hospitalName.trim(),
        contactNumber: values.contactNumber.trim(),
        note: (values.note || "").trim(),
        status: "Pending",
        timestamp: Date.now()
      } : {
        fullName: values.fullName.trim(),
        bloodGroup: group,
        phoneNumber: values.phoneNumber.trim(),
        location: values.location.trim(),
        timestamp: Date.now(),
        ...(form.id === "direct-donor-form" ? {} : { status: "pending" })
      };
      const node = isRequest ? "blood_requests" : form.id === "direct-donor-form" ? "donors" : "donor_applications";
      try {
        await saveRecord(node, record);
        form.reset();
        state.bloodGroup = "";
        render();
        showToast(isRequest ? "Your blood request has been submitted." : form.id === "direct-donor-form" ? "Verified donor added." : "Thank you! Your donor application is submitted for review.");
      } catch (error) {
        console.error(`Could not submit ${node}.`, error);
        showToast("Submission failed. Please check your connection and try again.", true);
      }
    } else if (form.id === "blog-form") {
      const values = formData(form);
      const coverImageUrl = values.coverImageUrl.trim();
      if (coverImageUrl && !safeImageUrl(coverImageUrl)) return showToast("Please use a valid http or https image URL.", true);
      try {
        await saveRecord("blogs", { title: values.title.trim(), coverImageUrl, body: values.body.trim(), author: state.adminUser ? (state.adminUser.displayName || "Admin") : "Admin", timestamp: Date.now() });
        form.reset();
        render();
        showToast("Article published successfully.");
      } catch (error) {
        console.error("Could not publish blog article.", error);
        showToast("Article could not be published. Please try again.", true);
      }
    } else if (form.id === "admin-login-form") {
      if (!auth) return showToast("Firebase Auth is required for email/password admin sign-in.", true);
      const values = formData(form);
      try {
        await auth.signInWithEmailAndPassword(values.email.trim(), values.password);
        form.reset();
        showToast("Signed in successfully.");
      } catch (error) {
        console.error("Admin sign-in failed.", error);
        showToast(error.code === "auth/invalid-credential" ? "Email or password is incorrect." : "Sign-in failed. Check your account and try again.", true);
      }
    }
  }

  async function logout() {
    try {
      if (auth && state.adminUser) await auth.signOut();
      state.demoAdmin = false;
      state.adminUser = null;
      render();
      showToast("You have been signed out.");
    } catch (error) {
      console.error("Admin sign-out failed.", error);
      showToast("Could not sign out. Please try again.", true);
    }
  }

  document.addEventListener("click", async (event) => {
    const target = event.target.closest("a, button, [data-close-modal]");
    if (!target) return;
    const route = target.closest("[data-route]");
    if (route) {
      event.preventDefault();
      navigate(route.dataset.route);
      return;
    }
    if (target.hasAttribute("data-slide")) {
      state.slide = Number(target.dataset.slide);
      render();
    } else if (target.hasAttribute("data-blood")) {
      state.bloodGroup = target.dataset.blood;
      document.querySelectorAll("[data-blood]").forEach((button) => {
        const selected = button.dataset.blood === state.bloodGroup;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
    } else if (target.hasAttribute("data-read-blog")) {
      state.modal = target.dataset.readBlog;
      render();
    } else if (target.hasAttribute("data-close-modal")) {
      if (target.classList.contains("modal-backdrop") && event.target.closest(".modal")) return;
      state.modal = null;
      render();
    } else if (target.hasAttribute("data-admin-tab")) {
      state.adminTab = target.dataset.adminTab;
      state.bloodGroup = "";
      render();
    } else if (target.hasAttribute("data-demo-admin")) {
      state.demoAdmin = true;
      state.adminTab = "applications";
      render();
    } else if (target.hasAttribute("data-admin-logout")) {
      await logout();
    } else if (target.hasAttribute("data-approve")) {
      await approveApplication(target.dataset.approve);
    } else if (target.hasAttribute("data-reject")) {
      try {
        await updateRecord(`donor_applications/${target.dataset.reject}`, { status: "rejected" });
        render();
        showToast("Application rejected.");
      } catch (error) {
        console.error("Could not reject donor application.", error);
        showToast("Could not update this application.", true);
      }
    } else if (target.hasAttribute("data-delete-blog")) {
      try {
        await removeRecord(`blogs/${target.dataset.deleteBlog}`);
        render();
        showToast("Article deleted.");
      } catch (error) {
        console.error("Could not delete blog article.", error);
        showToast("Article could not be deleted.", true);
      }
    }
  });

  document.addEventListener("submit", handleSubmit);
  document.addEventListener("change", async (event) => {
    const target = event.target;
    if (target.matches("[data-request-status]")) {
      try {
        await updateRecord(`blood_requests/${target.dataset.requestStatus}`, { status: target.value });
        showToast("Request status updated.");
      } catch (error) {
        console.error("Could not update blood request.", error);
        showToast("Request status could not be updated.", true);
      }
    }
  });
  function syncRoute() {
    const path = location.hash.startsWith("#/") ? location.hash.slice(1) : location.pathname;
    state.route = normalizeRoute(path);
    state.modal = null;
    render();
  }
  window.addEventListener("hashchange", syncRoute);
  window.addEventListener("popstate", syncRoute);

  document.getElementById("app").innerHTML = `<div class="loading">Loading BloodLink…</div>`;
  initializeFirebase();
  render();
})();
