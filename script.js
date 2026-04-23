// ==================== GLOBAL STATE ====================
let currentUser = null;
let isAdmin = false;
let currentPage = 'home';

// ==================== DOM ELEMENTS ====================
const app = document.getElementById('app');
const adminBtn = document.getElementById('btn-admin');
const loginStatus = document.getElementById('login-status');
const logoutBtn = document.getElementById('btn-logout');

// ==================== ROUTER ====================
const routes = ['home','commission','queue','gallery','profile','admin'];
function navigate(page) {
  if (!routes.includes(page)) return;
  if (page === 'admin' && !isAdmin) {
    alert('เฉพาะแอดมินเท่านั้น');
    return;
  }
  currentPage = page;
  renderPage();
}

// Badge listeners
document.getElementById('btn-home').onclick = () => navigate('home');
document.getElementById('btn-commission').onclick = () => navigate('commission');
document.getElementById('btn-queue').onclick = () => navigate('queue');
document.getElementById('btn-gallery').onclick = () => navigate('gallery');
document.getElementById('btn-profile').onclick = () => navigate('profile');
document.getElementById('btn-admin').onclick = () => navigate('admin');
document.getElementById('queue-check-btn').onclick = () => navigate('queue');

// ==================== AUTH ====================
window.fb.onAuthStateChanged(window.fb.auth, async (user) => {
  currentUser = user;
  if (user) {
    loginStatus.textContent = `👤 ${user.displayName || user.email}`;
    // ตรวจสอบ role
    const userDoc = await window.fb.getDoc(window.fb.doc(window.fb.db, 'users', user.uid));
    if (userDoc.exists() && userDoc.data().role === 'admin') {
      isAdmin = true;
      adminBtn.style.display = 'block';
    } else {
      isAdmin = false;
      adminBtn.style.display = 'none';
    }
  } else {
    loginStatus.textContent = 'ยังไม่ได้เข้าสู่ระบบ';
    isAdmin = false;
    adminBtn.style.display = 'none';
  }
  renderPage();
});

// Login/Logout Toggle
logoutBtn.onclick = async () => {
  if (!currentUser) {
    const provider = new window.fb.GoogleAuthProvider();
    try {
      const result = await window.fb.signInWithPopup(window.fb.auth, provider);
      // สร้าง user doc ถ้ายังไม่มี
      const user = result.user;
      await window.fb.setDoc(window.fb.doc(window.fb.db, 'users', user.uid), {
        username: user.displayName,
        avatar: user.photoURL,
        role: 'user' // default
      }, { merge: true });
    } catch (e) {
      console.error(e);
      alert('Login failed');
    }
  } else {
    await window.fb.signOut(window.fb.auth);
  }
};

// ==================== PAGE RENDERING ====================
function renderPage() {
  app.innerHTML = ''; // เคลียร์
  switch(currentPage) {
    case 'home': renderHome(); break;
    case 'commission': renderCommission(); break;
    case 'queue': renderQueue(); break;
    case 'gallery': renderGallery(); break;
    case 'profile': renderProfile(); break;
    case 'admin': if(isAdmin) renderAdmin(); break;
  }
}

// ---------- HOME ----------
function renderHome() {
  app.innerHTML = `
    <h1 style="font-size:3rem;">Welcome to Mona Commission</h1>
    <p style="font-size:1.2rem;">เลือกเมนูด้านบนเพื่อเริ่มต้น</p>
  `;
}

// ---------- COMMISSION CATALOG ----------
async function renderCommission() {
  app.innerHTML = `<h2>Commission Catalog</h2><div id="catalog-sections">Loading...</div>`;
  const sectionsEl = document.getElementById('catalog-sections');
  try {
    const q = window.fb.query(window.fb.collection(window.fb.db, 'commissionCategories'));
    const snap = await window.fb.getDocs(q);
    sectionsEl.innerHTML = '';
    snap.forEach(doc => {
      const data = doc.data();
      const sec = document.createElement('section');
      sec.className = 'catalog-section';
      sec.innerHTML = `
        <h3 class="pastel-title">${data.name}</h3>
        <div class="preview-gallery grid" id="preview-${doc.id}"></div>
        <table class="price-table"><tr><th>Type</th><th>Price (THB)</th></tr></table>
        <div class="addons"></div>
        <hr>
      `;
      // Preview images
      const previewGrid = sec.querySelector('.preview-gallery');
      (data.previewImages || []).forEach(url => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<img src="${url}" loading="lazy" alt="">`;
        previewGrid.appendChild(card);
      });
      // Prices
      const tbody = sec.querySelector('.price-table');
      (data.prices || []).forEach(p => {
        tbody.insertAdjacentHTML('beforeend', `<tr><td>${p.type}</td><td>${p.price}</td></tr>`);
      });
      // Add-ons
      const addonsDiv = sec.querySelector('.addons');
      (data.addons || []).forEach(a => {
        addonsDiv.innerHTML += `<span class="addon-tag">+${a.name} (${a.price} THB)</span> `;
      });
      sectionsEl.appendChild(sec);
    });

    // Contact buttons
    const contactDiv = document.createElement('div');
    contactDiv.style.textAlign = 'center';
    contactDiv.style.marginTop = '30px';
    contactDiv.innerHTML = `
      <a href="https://facebook.com/yourpage" target="_blank" class="contact-btn">Facebook</a>
      <a href="https://discord.gg/yourinvite" target="_blank" class="contact-btn">Discord</a>
      <a href="https://line.me/ti/p/yourline" target="_blank" class="contact-btn">Line</a>
    `;
    sectionsEl.appendChild(contactDiv);
  } catch (e) {
    sectionsEl.innerHTML = `<p>Error loading catalog: ${e.message}</p>`;
  }
}

// ---------- QUEUE ----------
function renderQueue() {
  app.innerHTML = `<h2>Queue</h2><div id="queue-list">Loading...</div>`;
  const listEl = document.getElementById('queue-list');
  const q = window.fb.query(
    window.fb.collection(window.fb.db, 'orders'),
    window.fb.where('status', 'not-in', ['delivered','reviewed']),
    window.fb.orderBy('queuePosition', 'asc')
  );
  window.fb.onSnapshot(q, (snapshot) => {
    const orders = [];
    snapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
    // Sort: isRush first, then queuePosition
    orders.sort((a,b)=>{
      if (a.isRush && !b.isRush) return -1;
      if (!a.isRush && b.isRush) return 1;
      return (a.queuePosition||999) - (b.queuePosition||999);
    });
    listEl.innerHTML = '';
    if (orders.length === 0) listEl.innerHTML = '<p>ไม่มีคิวในขณะนี้</p>';
    orders.forEach(order => {
      const progress = getProgress(order.status);
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <div class="card-body">
          <span class="badge-status status-${order.status}">${order.status}</span>
          ${order.isRush ? '<span class="badge-status" style="background:#ff4d4d;">🔥 RUSH</span>' : ''}
          <p><strong>${order.clientName || 'ไม่ระบุ'}</strong> - ${order.type || 'ไม่มีประเภท'}</p>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${progress}%"></div>
          </div>
        </div>
      `;
      listEl.appendChild(div);
    });
  }, (error) => {
    listEl.innerHTML = `<p>Error: ${error.message}</p>`;
  });
}

function getProgress(status) {
  const steps = ['created','accepted','in_progress','revision','completed','delivered','reviewed'];
  const idx = steps.indexOf(status);
  return ((idx+1)/steps.length)*100;
}

// ---------- GALLERY ----------
function renderGallery() {
  app.innerHTML = `<h2>Gallery</h2><div id="gallery-grid" class="grid">Loading...</div>`;
  const grid = document.getElementById('gallery-grid');
  window.fb.onSnapshot(
    window.fb.query(window.fb.collection(window.fb.db, 'gallery'), window.fb.orderBy('createdAt', 'desc')),
    (snap) => {
      grid.innerHTML = '';
      if (snap.empty) grid.innerHTML = '<p>ไม่มีรูปภาพ</p>';
      snap.forEach(doc => {
        const data = doc.data();
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<img src="${data.imageUrl}" loading="lazy" alt=""><div class="card-body">${data.category || ''}</div>`;
        grid.appendChild(card);
      });
    },
    (error) => { grid.innerHTML = `<p>Error: ${error.message}</p>`; }
  );
}

// ---------- PROFILE ----------
function renderProfile() {
  if (!currentUser) {
    app.innerHTML = '<p>กรุณาเข้าสู่ระบบก่อน</p>';
    return;
  }
  app.innerHTML = `
    <h2>My Profile</h2>
    <p><img src="${currentUser.photoURL}" style="width:80px;border-radius:50%;"> ${currentUser.displayName}</p>
    <h3>My Reviews</h3>
    <div id="my-reviews">Loading...</div>
  `;
  const reviewsDiv = document.getElementById('my-reviews');
  window.fb.onSnapshot(
    window.fb.query(window.fb.collection(window.fb.db, 'reviews'), window.fb.where('userId','==',currentUser.uid)),
    (snap) => {
      reviewsDiv.innerHTML = '';
      if (snap.empty) reviewsDiv.innerHTML = '<p>ยังไม่มีรีวิว</p>';
      snap.forEach(doc => {
        const r = doc.data();
        if (r.isHidden) return;
        reviewsDiv.innerHTML += `<div class="card"><div class="card-body">Rating: ${r.rating}/5<br>${r.comment}</div></div>`;
      });
    }
  );
}

// ---------- ADMIN DASHBOARD ----------
let adminTab = 'orders'; // orders, queue, reviews, gallery

function renderAdmin() {
  app.innerHTML = `
    <h2>Admin Dashboard</h2>
    <div class="tabs">
      <button class="tab" data-tab="orders">Orders</button>
      <button class="tab" data-tab="queue">Queue</button>
      <button class="tab" data-tab="reviews">Reviews</button>
      <button class="tab" data-tab="gallery">Gallery</button>
    </div>
    <div id="admin-content"></div>
  `;
  // Tab listeners
  document.querySelectorAll('.tab').forEach(btn => {
    btn.onclick = () => {
      adminTab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderAdminContent();
    };
  });
  // เปิด tab แรก
  document.querySelector('.tab[data-tab="orders"]').classList.add('active');
  renderAdminContent();
}

function renderAdminContent() {
  const content = document.getElementById('admin-content');
  switch(adminTab) {
    case 'orders': renderAdminOrders(content); break;
    case 'queue': renderAdminQueue(content); break;
    case 'reviews': renderAdminReviews(content); break;
    case 'gallery': renderAdminGallery(content); break;
  }
}

// ===== ADMIN: ORDER MANAGEMENT =====
function renderAdminOrders(container) {
  container.innerHTML = `
    <button id="create-order-btn" class="btn-primary" style="margin-bottom:20px;">+ Create Order</button>
    <div id="order-list"></div>
    <div id="order-form" style="display:none;"></div>
  `;
  const listEl = document.getElementById('order-list');
  const formEl = document.getElementById('order-form');

  // Real-time listener
  window.fb.onSnapshot(
    window.fb.query(window.fb.collection(window.fb.db, 'orders'), window.fb.orderBy('createdAt', 'desc')),
    (snap) => {
      listEl.innerHTML = '';
      snap.forEach(doc => {
        const order = doc.data();
        const div = document.createElement('div');
        div.className = 'card';
        div.style.marginBottom = '10px';
        div.innerHTML = `
          <div class="card-body">
            <strong>${order.clientName || 'No Name'}</strong> - ${order.type}<br>
            Status: <span class="badge-status status-${order.status}">${order.status}</span>
            <div>
              <button class="edit-order-btn btn-primary" data-id="${doc.id}">Edit</button>
            </div>
          </div>
        `;
        listEl.appendChild(div);
      });
      // Add event listeners to edit buttons
      document.querySelectorAll('.edit-order-btn').forEach(btn => {
        btn.onclick = () => {
          const id = btn.dataset.id;
          showOrderForm(id, formEl, listEl);
        };
      });
    }
  );

  document.getElementById('create-order-btn').onclick = () => showOrderForm(null, formEl, listEl);
}

function showOrderForm(orderId, container, listEl) {
  container.style.display = 'block';
  container.innerHTML = `<h3>${orderId ? 'Edit' : 'Create'} Order</h3>`;

  const existingData = {};
  if (orderId) {
    // Load existing data
    window.fb.getDoc(window.fb.doc(window.fb.db, 'orders', orderId)).then(snap => {
      if (snap.exists()) Object.assign(existingData, snap.data());
      buildForm(existingData);
    });
  } else {
    buildForm(existingData);
  }

  function buildForm(data) {
    container.innerHTML = `
      <div class="form-group"><label>Client Name</label><input id="f-clientName" value="${data.clientName||''}"></div>
      <div class="form-group"><label>Contact (FB/Discord/Line)</label><input id="f-contactChannel" value="${data.contactChannel||''}"></div>
      <div class="form-group"><label>Type</label><input id="f-type" value="${data.type||''}"></div>
      <div class="form-group"><label>Category</label><input id="f-category" value="${data.category||''}"></div>
      <div class="form-group"><label>Description</label><textarea id="f-description">${data.description||''}</textarea></div>
      <div class="form-group"><label>Status</label>
        <select id="f-status">
          ${['created','accepted','in_progress','revision','completed','delivered','reviewed'].map(s =>
            `<option value="${s}" ${data.status===s?'selected':''}>${s}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group"><label>Queue Position</label><input id="f-queuePosition" type="number" value="${data.queuePosition||1}"></div>
      <div class="form-group"><label>isRush</label><input id="f-isRush" type="checkbox" ${data.isRush?'checked':''}></div>
      <div class="form-group"><label>Admin Note</label><textarea id="f-adminNote">${data.adminNote||''}</textarea></div>
      <div class="form-group"><label>Reference Images (URLs, คอมม่า)</label><input id="f-refImages" value="${(data.referenceImages||[]).join(', ')}"></div>
      <div class="form-group"><label>Final Images (URLs, คอมม่า)</label><input id="f-finalImages" value="${(data.finalImages||[]).join(', ')}"></div>
      <div class="form-group">
        <label>Upload Reference Image</label><input type="file" id="ref-upload" multiple accept="image/*">
        <progress id="ref-progress" value="0" max="100" style="width:100%"></progress>
      </div>
      <div class="form-group">
        <label>Upload Final Image</label><input type="file" id="final-upload" multiple accept="image/*">
        <progress id="final-progress" value="0" max="100" style="width:100%"></progress>
      </div>
      <button id="save-order-btn" class="btn-primary" disabled>Save</button>
      <button id="cancel-order-btn" class="btn-primary" style="background:#555;">Cancel</button>
    `;

    // Debounce save button
    let saving = false;
    document.getElementById('save-order-btn').onclick = async () => {
      if (saving) return;
      saving = true;
      const btn = document.getElementById('save-order-btn');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        const refInput = document.getElementById('ref-upload');
        const finalInput = document.getElementById('final-upload');
        let refUrls = data.referenceImages || [];
        let finalUrls = data.finalImages || [];

        // Upload reference images if any
        if (refInput.files.length > 0) {
          refUrls = [];
          for (const file of refInput.files) {
            const storageRef = window.fb.ref(window.fb.storage, `orders/${orderId||'new'}/ref_${Date.now()}_${file.name}`);
            const uploadTask = window.fb.uploadBytesResumable(storageRef, file);
            await new Promise((res, rej) => {
              uploadTask.on('state_changed',
                (snap) => {
                  document.getElementById('ref-progress').value = (snap.bytesTransferred / snap.totalBytes) * 100;
                },
                rej,
                () => res()
              );
            });
            const url = await window.fb.getDownloadURL(uploadTask.snapshot.ref);
            refUrls.push(url);
          }
        }
        // Upload final images
        if (finalInput.files.length > 0) {
          finalUrls = [];
          for (const file of finalInput.files) {
            const storageRef = window.fb.ref(window.fb.storage, `orders/${orderId||'new'}/final_${Date.now()}_${file.name}`);
            const uploadTask = window.fb.uploadBytesResumable(storageRef, file);
            await new Promise((res, rej) => {
              uploadTask.on('state_changed',
                (snap) => {
                  document.getElementById('final-progress').value = (snap.bytesTransferred / snap.totalBytes) * 100;
                },
                rej,
                () => res()
              );
            });
            const url = await window.fb.getDownloadURL(uploadTask.snapshot.ref);
            finalUrls.push(url);
          }
        }

        const orderData = {
          clientName: document.getElementById('f-clientName').value,
          contactChannel: document.getElementById('f-contactChannel').value,
          type: document.getElementById('f-type').value,
          category: document.getElementById('f-category').value,
          description: document.getElementById('f-description').value,
          status: document.getElementById('f-status').value,
          queuePosition: parseInt(document.getElementById('f-queuePosition').value) || 1,
          isRush: document.getElementById('f-isRush').checked,
          adminNote: document.getElementById('f-adminNote').value,
          referenceImages: refUrls,
          finalImages: finalUrls,
          updatedAt: window.fb.serverTimestamp()
        };

        if (orderId) {
          await window.fb.updateDoc(window.fb.doc(window.fb.db, 'orders', orderId), orderData);
        } else {
          orderData.createdAt = window.fb.serverTimestamp();
          await window.fb.addDoc(window.fb.collection(window.fb.db, 'orders'), orderData);
        }
        container.style.display = 'none';
      } catch (e) {
        alert('Save failed: ' + e.message);
      }
      saving = false;
      btn.disabled = false;
      btn.textContent = 'Save';
    };

    document.getElementById('cancel-order-btn').onclick = () => {
      container.style.display = 'none';
    };
  }
}

// ===== ADMIN: QUEUE MANAGEMENT =====
function renderAdminQueue(container) {
  container.innerHTML = `<div id="admin-queue-list">Loading...</div>`;
  const listEl = document.getElementById('admin-queue-list');
  window.fb.onSnapshot(
    window.fb.query(window.fb.collection(window.fb.db, 'orders'), window.fb.orderBy('queuePosition','asc')),
    (snap) => {
      const orders = [];
      snap.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
      orders.sort((a,b) => {
        if (a.isRush && !b.isRush) return -1;
        if (!a.isRush && b.isRush) return 1;
        return (a.queuePosition||0) - (b.queuePosition||0);
      });
      listEl.innerHTML = '';
      orders.forEach((order, idx) => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `
          <div class="card-body">
            <strong>#${idx+1} ${order.clientName}</strong> - ${order.type}<br>
            Status: ${order.status} | Rush: ${order.isRush?'ใช่':'ไม่'}<br>
            <input type="number" value="${order.queuePosition}" min="1" data-id="${order.id}" class="queue-pos-input" style="width:60px;">
            <label><input type="checkbox" ${order.isRush?'checked':''} data-id="${order.id}" class="rush-toggle"> Rush</label>
          </div>
        `;
        listEl.appendChild(div);
      });
      // Add listeners
      document.querySelectorAll('.queue-pos-input').forEach(input => {
        input.onchange = async (e) => {
          const id = e.target.dataset.id;
          const pos = parseInt(e.target.value);
          await window.fb.updateDoc(window.fb.doc(window.fb.db, 'orders', id), { queuePosition: pos });
        };
      });
      document.querySelectorAll('.rush-toggle').forEach(cb => {
        cb.onchange = async (e) => {
          const id = e.target.dataset.id;
          await window.fb.updateDoc(window.fb.doc(window.fb.db, 'orders', id), { isRush: e.target.checked });
        };
      });
    }
  );
}

// ===== ADMIN: REVIEW MODERATION =====
function renderAdminReviews(container) {
  container.innerHTML = `<div id="admin-reviews">Loading...</div>`;
  const revEl = document.getElementById('admin-reviews');
  window.fb.onSnapshot(window.fb.collection(window.fb.db, 'reviews'), (snap) => {
    revEl.innerHTML = '';
    snap.forEach(doc => {
      const r = doc.data();
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `
        <div class="card-body">
          <p>Rating: ${r.rating}/5 - ${r.comment}</p>
          <small>Order: ${r.orderId} | User: ${r.userId}</small>
          <span class="badge-status" style="background:${r.isHidden?'red':'green'}">${r.isHidden?'Hidden':'Visible'}</span>
          <button data-id="${doc.id}" class="toggle-hide-btn btn-primary">${r.isHidden?'Show':'Hide'}</button>
          <button data-id="${doc.id}" class="delete-review-btn btn-primary" style="background:red;">Delete</button>
        </div>
      `;
      revEl.appendChild(div);
    });
    document.querySelectorAll('.toggle-hide-btn').forEach(btn => {
      btn.onclick = async (e) => {
        const id = e.target.dataset.id;
        const docRef = window.fb.doc(window.fb.db, 'reviews', id);
        const snap = await window.fb.getDoc(docRef);
        if (snap.exists()) {
          await window.fb.updateDoc(docRef, { isHidden: !snap.data().isHidden });
        }
      };
    });
    document.querySelectorAll('.delete-review-btn').forEach(btn => {
      btn.onclick = async (e) => {
        if (confirm('ลบรีวิวนี้?')) {
          await window.fb.deleteDoc(window.fb.doc(window.fb.db, 'reviews', e.target.dataset.id));
        }
      };
    });
  });
}

// ===== ADMIN: GALLERY MANAGEMENT =====
function renderAdminGallery(container) {
  container.innerHTML = `
    <div class="form-group"><label>Image URL (หรืออัปโหลด)</label><input id="gallery-url"></div>
    <div class="form-group"><label>Upload Image</label><input type="file" id="gallery-file" accept="image/*"><progress id="gallery-progress" value="0" max="100"></progress></div>
    <div class="form-group"><label>Category</label><input id="gallery-category" placeholder="NORMAL, CHIBI..."></div>
    <button id="add-gallery-btn" class="btn-primary">Add to Gallery</button>
    <div id="gallery-list" style="margin-top:20px;" class="grid"></div>
  `;
  const listEl = document.getElementById('gallery-list');
  // Load existing
  window.fb.onSnapshot(window.fb.collection(window.fb.db, 'gallery'), (snap) => {
    listEl.innerHTML = '';
    snap.forEach(doc => {
      const data = doc.data();
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<img src="${data.imageUrl}" loading="lazy"><div class="card-body">${data.category||''}<br><button data-id="${doc.id}" class="delete-gal-btn btn-primary" style="background:red;">Delete</button></div>`;
      listEl.appendChild(card);
    });
    document.querySelectorAll('.delete-gal-btn').forEach(btn => {
      btn.onclick = async (e) => {
        if (confirm('ลบภาพนี้?')) {
          await window.fb.deleteDoc(window.fb.doc(window.fb.db, 'gallery', e.target.dataset.id));
        }
      };
    });
  });

  document.getElementById('add-gallery-btn').onclick = async () => {
    const urlInput = document.getElementById('gallery-url').value;
    const fileInput = document.getElementById('gallery-file');
    let imageUrl = urlInput;
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const storageRef = window.fb.ref(window.fb.storage, `gallery/${Date.now()}_${file.name}`);
      const uploadTask = window.fb.uploadBytesResumable(storageRef, file);
      await new Promise((res, rej) => {
        uploadTask.on('state_changed',
          (snap) => { document.getElementById('gallery-progress').value = (snap.bytesTransferred / snap.totalBytes)*100; },
          rej,
          () => res()
        );
      });
      imageUrl = await window.fb.getDownloadURL(uploadTask.snapshot.ref);
    }
    if (!imageUrl) return alert('กรุณาใส่ URL หรืออัปโหลดรูป');
    await window.fb.addDoc(window.fb.collection(window.fb.db, 'gallery'), {
      imageUrl,
      category: document.getElementById('gallery-category').value,
      createdAt: window.fb.serverTimestamp()
    });
    document.getElementById('gallery-url').value = '';
    document.getElementById('gallery-file').value = '';
    document.getElementById('gallery-category').value = '';
  };
}
