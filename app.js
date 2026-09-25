import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, where, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, getDoc, setDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
// Đã xóa import firebase-storage

const firebaseConfig = {
    apiKey: "AIzaSyC5-lQjrxIUjW9bqbr9UHD4s4fIsCvF6iw",
    authDomain: "vanilms.firebaseapp.com",
    projectId: "vanilms",
    messagingSenderId: "269688828853",
    appId: "1:269688828853:web:9a333301de72cd2f401ffc"
    // Đã xóa storageBucket
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
const ADMIN_EMAIL = "nguyennhatquanyb@gmail.com"; 

let currentCourseId = null;
let unsubscribeCourseAnnouncements = null;
let unsubscribeCourseAssignments = null;
let unsubscribeCourseChats = null;
let unsubscribeCourseRecords = null;
let unsubscribeCourseSlides = null;
let unsubscribeCurrentCourseInfo = null;

let allUsersCache = {}; 

// ==========================================
// CẤU HÌNH API GOOGLE DRIVE (GAS)
// ==========================================
const GAS_URL = "https://script.google.com/macros/s/AKfycbzVJFtxfpVRXZz7Wf1zyhW_srGJFcI2sqSI-G7pdKAEKn-rsYyGyCld2LoBO477fbXB/exec";

const getBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});

async function uploadFileToDrive(file) {
    try {
        const base64Data = await getBase64(file);
        const payload = {
            fileName: `${Date.now()}_${file.name}`,
            mimeType: file.type,
            base64: base64Data
        };
        const response = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === "success") {
            return result.url; 
        } else {
            console.error("Lỗi từ Drive:", result.message);
            return null;
        }
    } catch (error) {
        console.error("Lỗi kết nối API Drive:", error);
        return null;
    }
}

// ==========================================
// UTILS 
// ==========================================
function formatTimeAgo(timestamp) {
    if (!timestamp || typeof timestamp.toDate !== 'function') return 'Vừa xong';
    const seconds = Math.floor((new Date() - timestamp.toDate()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " năm trước";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " tháng trước";
    interval = seconds / 604800;
    if (interval > 1) return Math.floor(interval) + " tuần trước";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " ngày trước";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " giờ trước";
    interval = seconds / 60;
    if (interval >= 1) return Math.floor(interval) + " phút trước";
    return "Vừa xong";
}

function getAvatarColor(char) {
    if (!char) return '#1877f2';
    const colors = ['#0052cc', '#137333', '#d93025', '#e37400', '#f29900', '#8e24aa'];
    let sum = 0;
    for(let i=0; i<char.length; i++) sum += char.charCodeAt(i);
    return colors[sum % colors.length];
}

async function fetchUserByEmail(email) {
    if (allUsersCache[email]) return allUsersCache[email];
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);
    if (!snap.empty) {
        allUsersCache[email] = snap.docs[0].data();
        return allUsersCache[email];
    }
    return { name: "Thành viên", mssv: "N/A" };
}

// ==========================================
// ĐIỀU HƯỚNG & XÁC THỰC & ONBOARDING
// ==========================================
window.showPage = function(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    document.querySelectorAll('.modern-nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.modern-nav button[onclick="showPage('${pageId}')"]`);
    if(activeBtn) activeBtn.classList.add('active');
};

document.getElementById('login-btn').addEventListener('click', () => {
    signInWithPopup(auth, new GoogleAuthProvider()).catch(err => {
        if(err.code !== 'auth/popup-closed-by-user') console.error("Lỗi đăng nhập:", err);
    });
});
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
        try {
            const userDocSnap = await getDoc(doc(db, "users", user.uid));
            if (!userDocSnap.exists() || !userDocSnap.data().isProfileComplete) {
                document.getElementById('onboarding-modal').style.display = 'flex';
                document.getElementById('ob-name').value = user.displayName || "";
            } else {
                loadUserApp(user, userDocSnap.data());
            }
        } catch (e) { console.error(e); }
    } else {
        document.getElementById('login-btn').style.display = 'inline-flex';
        document.getElementById('user-info').style.display = 'none';
        document.getElementById('post-form-container').style.display = 'none';
        document.getElementById('global-chat-input-container').style.display = 'none';
        document.getElementById('nav-admin').style.display = 'none';
        document.getElementById('course-list').innerHTML = '<div class="empty-state">Vui lòng đăng nhập để xem.</div>';
    }
});

function loadUserApp(user, userData) {
    document.getElementById('login-btn').style.display = 'none';
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('username').textContent = userData.name || user.displayName || "Người dùng";
    
    document.getElementById('set-name').value = userData.name || "";
    document.getElementById('set-mssv').value = userData.mssv || "";
    document.getElementById('set-username').value = userData.username || "";
    document.getElementById('set-dob').value = userData.dob || "";
    document.getElementById('set-phone').value = userData.phone || "";
    document.getElementById('set-class').value = userData.className || "";
    document.getElementById('set-uni').value = userData.uni || "";
    
    document.getElementById('settings-email').textContent = user.email;

    const avatar = user.photoURL || `https://ui-avatars.com/api/?name=${userData.name || 'User'}`;
    document.getElementById('user-avatar').src = avatar;
    document.getElementById('composer-avatar').src = avatar;
    document.getElementById('settings-avatar').src = avatar;
    
    document.getElementById('post-form-container').style.display = 'block';
    document.getElementById('global-chat-input-container').style.display = 'flex';
    document.getElementById('nav-admin').style.display = (user.email === ADMIN_EMAIL) ? 'block' : 'none';
    
    loadCourses(user.email);
}

document.getElementById('ob-submit-btn').addEventListener('click', async () => {
    if(!document.getElementById('ob-agree').checked) return alert("Vui lòng tích xác nhận đồng ý các điều khoản!");
    
    const data = {
        name: document.getElementById('ob-name').value.trim(),
        mssv: document.getElementById('ob-mssv').value.trim(),
        username: document.getElementById('ob-username').value.trim(),
        dob: document.getElementById('ob-dob').value,
        phone: document.getElementById('ob-phone').value.trim(),
        className: document.getElementById('ob-class').value.trim(),
        uni: document.getElementById('ob-uni').value.trim(),
        email: currentUser.email,
        isProfileComplete: true,
        updatedAt: serverTimestamp()
    };
    
    if(Object.values(data).some(v => v === "")) return alert("Vui lòng điền đầy đủ tất cả thông tin!");
    
    try {
        await updateProfile(currentUser, { displayName: data.name });
        await setDoc(doc(db, "users", currentUser.uid), data, { merge: true });
        document.getElementById('onboarding-modal').style.display = 'none';
        loadUserApp(currentUser, data);
        alert("Cập nhật thông tin thành công!");
    } catch(e) { console.error(e); alert("Lỗi khi lưu thông tin!"); }
});

const saveSettingsBtn = document.getElementById('save-settings-btn');
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
        if (!currentUser) return;
        const data = {
            name: document.getElementById('set-name').value.trim(),
            mssv: document.getElementById('set-mssv').value.trim(),
            username: document.getElementById('set-username').value.trim(),
            dob: document.getElementById('set-dob').value,
            phone: document.getElementById('set-phone').value.trim(),
            className: document.getElementById('set-class').value.trim(),
            uni: document.getElementById('set-uni').value.trim(),
            updatedAt: serverTimestamp()
        };
        
        if (Object.values(data).some(v => v === "")) return alert("Không được để trống thông tin bắt buộc!");
        try {
            await updateProfile(currentUser, { displayName: data.name });
            await setDoc(doc(db, "users", currentUser.uid), data, { merge: true });
            document.getElementById('username').textContent = data.name;
            alert("Cập nhật thông tin thành công!");
        } catch (error) { alert("Có lỗi xảy ra, vui lòng thử lại!"); }
    });
}

// ==========================================
// DROPDOWN AVATAR & CHUÔNG
// ==========================================
window.toggleProfileMenu = function() {
    const dropdown = document.getElementById('profile-dropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
};

document.getElementById('notification-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('notification-dropdown');
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    document.getElementById('notification-count').style.display = 'none';
});

document.addEventListener('click', (e) => {
    const notiWrap = document.getElementById('notification-wrapper');
    if (notiWrap && !notiWrap.contains(e.target)) document.getElementById('notification-dropdown').style.display = 'none';
    
    const profMenu = document.querySelector('.user-profile-menu');
    if (profMenu && !profMenu.contains(e.target)) document.getElementById('profile-dropdown').style.display = 'none';
});

// ==========================================
// 0. TRA CỨU THÔNG TIN SINH VIÊN
// ==========================================
window.searchUsers = async function() {
    const qStr = document.getElementById('search-query').value.trim().toLowerCase();
    if(!qStr) return;
    const resDiv = document.getElementById('search-results');
    resDiv.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang tìm kiếm...</div>';
    
    try {
        const snap = await getDocs(collection(db, "users"));
        let results = [];
        snap.forEach(d => {
            const u = d.data();
            if ((u.name && u.name.toLowerCase().includes(qStr)) || (u.mssv && u.mssv.toLowerCase().includes(qStr))) {
                results.push(u);
            }
        });
        
        if(results.length === 0) { resDiv.innerHTML = '<div style="padding:15px; color:var(--danger);">Không tìm thấy sinh viên nào phù hợp.</div>'; return; }
        
        const isAdmin = currentUser && currentUser.email === ADMIN_EMAIL;
        let html = '';
        results.forEach(u => {
            const adminInfo = isAdmin ? `<div style="font-size:0.85rem; color:var(--primary); margin-top:5px; border-top:1px dashed #eee; padding-top:5px;"><b>Email:</b> ${u.email} | <b>SĐT:</b> ${u.phone || 'N/A'} | <b>Username:</b> ${u.username || 'N/A'} | <b>DOB:</b> ${u.dob || 'N/A'}</div>` : '';
            html += `
                <div class="modern-card" style="padding:15px; display:flex; gap:15px; align-items:center; margin-bottom:10px;">
                    <div class="noti-avatar" style="background:${getAvatarColor((u.name||'U').charAt(0))}">${(u.name||'U').charAt(0).toUpperCase()}</div>
                    <div style="flex:1;">
                        <div style="font-weight:600; font-size:1.05rem;">${u.name} <span style="font-weight:400; font-size:0.85rem; color:var(--text-muted);">(${u.mssv || 'Chưa có MSSV'})</span></div>
                        <div style="font-size:0.85rem; color:var(--text-muted); margin-top:3px;">Trường: ${u.uni || 'N/A'} - Lớp: ${u.className || 'N/A'}</div>
                        ${adminInfo}
                    </div>
                </div>`;
        });
        resDiv.innerHTML = html;
    } catch(err) {
        resDiv.innerHTML = '<div style="color:var(--danger);">Lỗi tra cứu dữ liệu.</div>';
    }
};

// ==========================================
// 1. QUẢN LÝ KHÓA HỌC TỔNG
// ==========================================
document.getElementById('create-course-btn').addEventListener('click', async () => {
    const title = document.getElementById('course-title').value;
    const code = document.getElementById('course-code').value;
    const date = document.getElementById('course-date').value;
    const emails = document.getElementById('course-emails').value.split(',').map(e => e.trim().toLowerCase()).filter(e => e !== '');
    if (!title) return alert("Nhập tên khóa học!");
    await addDoc(collection(db, "courses"), { title, code, date, allowedEmails: emails, leaders: [], createdAt: serverTimestamp() });
    alert("Tạo khóa học thành công!");
});

function loadCourses(userEmail) {
    const courseList = document.getElementById('course-list');
    let q = (userEmail === ADMIN_EMAIL) ? query(collection(db, "courses"), orderBy("createdAt", "desc")) : query(collection(db, "courses"), where("allowedEmails", "array-contains", userEmail.toLowerCase()));
    
    onSnapshot(q, (snapshot) => {
        courseList.innerHTML = '';
        const notiList = document.getElementById('notification-list');
        let notiCount = 0; let notiHtml = '';

        snapshot.forEach(docSnap => {
            const data = docSnap.data(); const cid = docSnap.id;
            const courseIdentifier = data.title || data.code || "Lớp mới"; 
            const initial = courseIdentifier.charAt(0).toUpperCase();
            const timeAgo = formatTimeAgo(data.createdAt);
            
            notiHtml += `
                <div class="noti-item" onclick="openCourse('${cid}', '${data.title}'); document.getElementById('notification-dropdown').style.display='none';">
                    <div class="noti-avatar" style="background: ${getAvatarColor(initial)};">${initial}</div>
                    <div class="noti-content">
                        <div class="noti-text">🎉 Welcome to class ${courseIdentifier}</div>
                        <div class="noti-time">${timeAgo}</div>
                    </div>
                    <div class="noti-unread-dot"></div>
                </div>`;
            notiCount++;

            const imageUrl = data.imageUrl || "https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=600&q=80";
            const adminBtns = (userEmail === ADMIN_EMAIL) ? `<div class="admin-course-actions"><button class="btn-icon" style="background: white;" onclick="deleteCourse('${cid}')"><i class="fa-solid fa-trash" style="color:var(--danger)"></i></button></div>` : '';
            
            courseList.innerHTML += `
                <div class="course-card">
                    ${adminBtns}
                    <img src="${imageUrl}" class="course-thumb">
                    <div class="course-info">
                        <div class="course-title">${data.title}</div>
                        <div class="course-meta">
                            <span><i class="fa-solid fa-tag"></i> ${data.code || 'N/A'}</span>
                            <span style="margin-left: 10px;"><i class="fa-regular fa-clock"></i> ${data.date || ''}</span>
                        </div>
                        <button class="btn-primary w-100" style="margin-top:auto; justify-content:center;" onclick="openCourse('${cid}', '${data.title}')">Vào lớp</button>
                    </div>
                </div>`;
        });

        if(notiList) notiList.innerHTML = notiHtml || '<div style="padding:20px; text-align:center; color:var(--text-muted);">Không có thông báo nào</div>';
        const badge = document.getElementById('notification-count');
        if(badge) { badge.style.display = notiCount > 0 ? 'block' : 'none'; badge.innerText = notiCount; }
    });
}
window.deleteCourse = async (id) => { if(confirm("Xóa khóa học này?")) await deleteDoc(doc(db, "courses", id)); };


// ==========================================
// 2. CHI TIẾT KHÓA HỌC (LMS MODULES)
// ==========================================
window.switchCourseTab = function(tabId, element) {
    if(element) {
        document.querySelectorAll('.sidebar-module').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
    }
    document.querySelectorAll('.c-tab-content').forEach(c => c.style.display = 'none');
    document.getElementById(`c-tab-${tabId}`).style.display = 'block';
};

window.openCourse = function(courseId, courseTitle) {
    currentCourseId = courseId;
    document.getElementById('c-brand-name').innerText = courseTitle;
    showPage('course-detail');
    switchCourseTab('announcements', document.querySelector('.sidebar-module')); 

    if(unsubscribeCourseAnnouncements) unsubscribeCourseAnnouncements();
    if(unsubscribeCourseAssignments) unsubscribeCourseAssignments();
    if(unsubscribeCourseChats) unsubscribeCourseChats();
    if(unsubscribeCourseRecords) unsubscribeCourseRecords();
    if(unsubscribeCourseSlides) unsubscribeCourseSlides();
    if(unsubscribeCurrentCourseInfo) unsubscribeCurrentCourseInfo();

    unsubscribeCurrentCourseInfo = onSnapshot(doc(db, "courses", courseId), (docSnap) => {
        const cData = docSnap.data();
        if(!cData) return;
        window.currentCourseData = cData;
        document.getElementById('c-brand-name').innerText = cData.title;

        const isGlobalAdmin = currentUser && currentUser.email === ADMIN_EMAIL;
        const leaders = cData.leaders || [];
        const isLeader = currentUser && leaders.includes(currentUser.email);
        const canEdit = isGlobalAdmin || isLeader;
        
        document.getElementById('btn-show-up-record').style.display = canEdit ? 'inline-flex' : 'none';
        document.getElementById('btn-show-up-slide').style.display = canEdit ? 'inline-flex' : 'none';
        document.getElementById('admin-add-student-area').style.display = canEdit ? 'flex' : 'none';
        document.getElementById('form-add-announcement').style.display = canEdit ? 'block' : 'none';
        document.getElementById('btn-show-add-assignment').style.display = canEdit ? 'inline-flex' : 'none';
        
        const announceAvatar = document.getElementById('announce-composer-avatar');
        if(announceAvatar && currentUser) announceAvatar.src = currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName}`;

        const editBtn = document.getElementById('btn-edit-course');
        if(editBtn) editBtn.style.display = canEdit ? 'flex' : 'none';

        renderStudentTable(courseId, cData.allowedEmails || [], leaders, canEdit);
    });

    unsubscribeCourseAnnouncements = onSnapshot(query(collection(db, "course_announcements"), where("courseId", "==", courseId)), (snapshot) => {
        const list = document.getElementById('course-announcements-list'); list.innerHTML = '';
        if (snapshot.empty) { list.innerHTML = `<div class="modern-card" style="padding:20px; text-align:center; color:var(--text-muted);">Chưa có thông báo nào từ Leader.</div>`; return; }

        snapshot.forEach(docSnap => {
            const data = docSnap.data(); const announceId = docSnap.id;
            const isOwnerOrAdmin = currentUser && (data.uid === currentUser.uid || currentUser.email === ADMIN_EMAIL);
            const delBtn = isOwnerOrAdmin ? `<button class="btn-icon" style="color:var(--danger)" onclick="deleteAnnouncement('${announceId}')"><i class="fa-solid fa-trash"></i></button>` : '';

            let commentsHtml = '';
            if (data.comments && data.comments.length > 0) {
                data.comments.forEach(c => {
                    const cAvatar = c.photoURL || `https://ui-avatars.com/api/?name=${c.name}&background=random`;
                    commentsHtml += `<div class="comment-item" style="display:flex; gap:8px; margin-bottom:10px;"><img src="${cAvatar}" class="avatar-sm"><div class="comment-bubble" style="background:#f0f2f5; padding:8px 12px; border-radius:18px;"><div style="font-weight:600; font-size:0.85rem;">${c.name}</div><div style="font-size:0.9rem;">${c.text}</div></div></div>`;
                });
            }

            const avatar = data.photoURL || `https://ui-avatars.com/api/?name=${data.name}&background=random`;
            list.innerHTML += `<div class="modern-card post"><div class="post-header"><div style="display:flex; align-items:center; gap:10px;"><img src="${avatar}" class="avatar-sm"><div><span class="post-author-name">${data.name} <span class="badge-leader" style="font-size:0.7rem; padding:2px 6px; margin-left:5px;">Leader</span></span></div></div>${delBtn}</div><div class="post-content" style="margin-bottom:15px; font-weight: 500;">${data.text}</div><div class="comment-section" style="padding-top:10px; border-top:1px solid #eee;">${commentsHtml}${currentUser ? `<div style="display:flex; gap:8px; margin-top:10px; align-items:center;"><img src="${currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName}&background=random`}" class="avatar-sm"><input type="text" id="announce-cmt-input-${announceId}" style="margin:0; border-radius:20px; padding:10px 15px; flex:1; border:none; background:#f0f2f5;" placeholder="Viết bình luận..." onkeypress="if(event.key==='Enter') addAnnounceComment('${announceId}')"></div>` : ''}</div></div>`;
        });
    });

    unsubscribeCourseAssignments = onSnapshot(query(collection(db, "course_assignments"), where("courseId", "==", courseId)), (snapshot) => {
        const list = document.getElementById('course-assignments-list'); list.innerHTML = '';
        if (snapshot.empty) { list.innerHTML = `<div class="modern-card" style="padding:20px; text-align:center; color:var(--text-muted);">Chưa có bài tập nào.</div>`; return; }

        const isGlobalAdmin = currentUser && currentUser.email === ADMIN_EMAIL;
        const leaders = window.currentCourseData ? (window.currentCourseData.leaders || []) : [];
        const isLeader = currentUser && leaders.includes(currentUser.email);
        const canEdit = isGlobalAdmin || isLeader;

        snapshot.forEach(docSnap => {
            const data = docSnap.data(); const assignId = docSnap.id;
            const fileHtml = data.fileUrl ? `<a href="${data.fileUrl}" target="_blank" style="color:var(--primary); font-size:0.9rem; text-decoration:none;"><i class="fa-solid fa-paperclip"></i> File đính kèm</a>` : '';
            const delBtn = canEdit ? `<button class="btn-icon" style="color:var(--danger)" onclick="deleteAssignment('${assignId}')" title="Xóa bài tập"><i class="fa-solid fa-trash"></i></button>` : '';
            
            let actionArea = '';
            if (canEdit) {
                actionArea = `<button class="btn-success" style="padding:6px 15px; font-size:0.85rem;" onclick="viewSubmissions('${assignId}')">Xem bài nộp</button>`;
            } else {
                actionArea = `
                    <div style="border-top:1px solid #eee; margin-top:15px; padding-top:15px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <input type="file" id="submit-file-${assignId}" style="font-size:0.85rem; flex:1;">
                            <input type="text" id="submit-text-${assignId}" placeholder="Ghi chú thêm..." style="flex:2; margin:0; padding:8px 12px;">
                            <button class="btn-primary" onclick="submitAssignment('${assignId}')">Nộp bài</button>
                        </div>
                        <div id="submit-status-${assignId}" style="display:none; color:var(--success); font-size:0.8rem; margin-top:5px;">Đang tải lên...</div>
                    </div>`;
            }

            const formattedDate = data.dueDate ? new Date(data.dueDate).toLocaleString('vi-VN') : 'Không giới hạn';
            list.innerHTML += `
                <div class="modern-card assignment-card">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div>
                            <div class="assignment-title">${data.title}</div>
                            <div class="assignment-meta" style="margin:5px 0;">
                                <span><i class="fa-regular fa-clock"></i> Hạn nộp: <b>${formattedDate}</b></span>
                                ${fileHtml}
                            </div>
                        </div>
                        ${delBtn}
                    </div>
                    <div class="assignment-desc">${data.desc || 'Không có mô tả'}</div>
                    ${actionArea}
                </div>`;
        });
    });

    unsubscribeCourseChats = onSnapshot(query(collection(db, "course_chats"), where("courseId", "==", courseId)), (snapshot) => {
        const box = document.getElementById('course-chat-box'); box.innerHTML = '';
        snapshot.forEach(d => {
            const msg = d.data(); const isMe = currentUser && msg.uid === currentUser.uid; const isAdmin = currentUser && currentUser.email === ADMIN_EMAIL;
            const avatar = msg.photoURL || `https://ui-avatars.com/api/?name=${msg.name}`;
            const fileHtml = msg.fileUrl ? `<div class="msg-file">📎 <a href="${msg.fileUrl}" target="_blank">${msg.fileName}</a></div>` : '';
            const delBtn = (isMe || isAdmin) ? `<button class="btn-del-msg" onclick="delCourseMsg('${d.id}')">Gỡ tin nhắn</button>` : '';
            box.innerHTML += `<div class="chat-message ${isMe ? 'me' : 'user'}">${!isMe ? `<div class="chat-author">${msg.name}</div>` : ''}<div style="display: flex; gap:8px; align-items:flex-end; ${isMe ? 'flex-direction:row-reverse;' : ''}"><img src="${avatar}" class="avatar-sm" style="width:28px; height:28px;"><div><div class="chat-bubble">${msg.text} ${fileHtml}</div>${delBtn}</div></div></div>`;
        });
        box.scrollTop = box.scrollHeight; 
    });

    unsubscribeCourseSlides = onSnapshot(query(collection(db, "course_slides"), where("courseId", "==", courseId)), (snapshot) => {
        const list = document.getElementById('course-slides-list'); list.innerHTML = '';
        if (snapshot.empty) { list.innerHTML = `<div class="modern-card" style="padding: 20px; text-align: center; color: var(--text-muted); grid-column: span 2;"><p>Chưa có tài liệu nào.</p></div>`; return; }
        snapshot.forEach(d => {
            const slide = d.data(); const canEdit = currentUser && currentUser.email === ADMIN_EMAIL; const delBtn = canEdit ? `<button class="btn-danger w-100" style="margin-top:10px;" onclick="delSlide('${d.id}')">Xóa Slide</button>` : '';
            list.innerHTML += `<div class="modern-card" style="padding: 15px; display:flex; flex-direction:column; justify-content:space-between;"><div><div style="font-weight: 600; margin-bottom: 5px;">${slide.title}</div></div><div><a href="${slide.url}" target="_blank" class="btn-primary w-100" style="justify-content:center;"><i class="fa-solid fa-download"></i> Tải xuống</a>${delBtn}</div></div>`;
        });
    });

    unsubscribeCourseRecords = onSnapshot(query(collection(db, "course_records"), where("courseId", "==", courseId)), (snapshot) => {
        const list = document.getElementById('course-records-list'); list.innerHTML = '';
        if (snapshot.empty) { list.innerHTML = `<div class="modern-card" style="padding: 20px; text-align: center; color: var(--text-muted); grid-column: span 2;"><p>Chưa có video nào.</p></div>`; return; }
        snapshot.forEach(d => {
            const rec = d.data(); const delBtn = (currentUser && currentUser.email === ADMIN_EMAIL) ? `<button class="btn-danger w-100" style="margin-top:10px;" onclick="delRecord('${d.id}')">Xóa Video</button>` : '';
            list.innerHTML += `<div class="modern-card" style="padding: 15px;"><div style="font-weight: 600; margin-bottom: 10px;">${rec.title}</div><a href="${rec.url}" target="_blank" class="btn-primary w-100" style="justify-content:center;"><i class="fa-brands fa-youtube"></i> Xem Video</a>${delBtn}</div>`;
        });
    });
};

// ==========================================
// TÍNH NĂNG BÀI TẬP (ASSIGNMENTS)
// ==========================================
document.getElementById('submit-assignment-btn').addEventListener('click', async () => {
    const title = document.getElementById('assign-title').value;
    const desc = document.getElementById('assign-desc').value;
    const due = document.getElementById('assign-due').value;
    const fileInput = document.getElementById('assign-file');
    
    if(!title) return alert("Vui lòng nhập tiêu đề bài tập!");
    
    document.getElementById('submit-assignment-btn').disabled = true;
    document.getElementById('submit-assignment-btn').innerText = "Đang giao...";

    let fileUrl = null;
    try {
        if(fileInput.files.length > 0) {
            fileUrl = await uploadFileToDrive(fileInput.files[0]);
            if (!fileUrl) throw new Error("Upload bài tập thất bại");
        }
        await addDoc(collection(db, "course_assignments"), {
            courseId: currentCourseId, title, desc, dueDate: due, fileUrl,
            uid: currentUser.uid, name: currentUser.displayName, createdAt: serverTimestamp()
        });
        document.getElementById('form-add-assignment').style.display = 'none';
        document.getElementById('assign-title').value = ''; document.getElementById('assign-desc').value = '';
        document.getElementById('assign-due').value = ''; fileInput.value = '';
        alert("Giao bài tập thành công!");
    } catch(err) { console.error(err); alert("Có lỗi xảy ra khi tạo bài tập.");
    } finally { document.getElementById('submit-assignment-btn').disabled = false; document.getElementById('submit-assignment-btn').innerText = "Giao bài"; }
});

window.deleteAssignment = async (id) => { if(confirm("Xóa bài tập này? (Sẽ mất toàn bộ bài nộp)")) await deleteDoc(doc(db, "course_assignments", id)); };

window.submitAssignment = async (assignId) => {
    if (!currentUser) return alert("Vui lòng đăng nhập!");
    const textInput = document.getElementById(`submit-text-${assignId}`).value;
    const fileInput = document.getElementById(`submit-file-${assignId}`);
    const statusDiv = document.getElementById(`submit-status-${assignId}`);
    if(!textInput.trim() && fileInput.files.length === 0) return alert("Vui lòng đính kèm file hoặc nhập ghi chú!");
    
    statusDiv.style.display = 'block';
    let fileUrl = null;
    try {
        if(fileInput.files.length > 0) {
            fileUrl = await uploadFileToDrive(fileInput.files[0]);
            if (!fileUrl) throw new Error("Upload bài nộp thất bại");
        }
        await addDoc(collection(db, "course_submissions"), {
            assignmentId: assignId, courseId: currentCourseId, uid: currentUser.uid,
            name: currentUser.displayName, text: textInput, fileUrl: fileUrl, submittedAt: serverTimestamp()
        });
        alert("Nộp bài thành công!");
        document.getElementById(`submit-text-${assignId}`).value = ''; fileInput.value = '';
    } catch (e) { console.error(e); alert("Lỗi khi nộp bài!"); } finally { statusDiv.style.display = 'none'; }
};

window.viewSubmissions = async (assignId) => {
    const modal = document.getElementById('view-submissions-modal');
    const listContainer = document.getElementById('submissions-list-container');
    listContainer.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i> Đang tải...</div>';
    modal.style.display = 'flex';
    try {
        const qSub = query(collection(db, "course_submissions"), where("assignmentId", "==", assignId));
        const querySnapshot = await getDocs(qSub);
        if (querySnapshot.empty) {
            listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">Chưa có sinh viên nào nộp bài.</div>';
            return;
        }
        let html = '';
        querySnapshot.forEach(docSnap => {
            const sub = docSnap.data();
            const time = sub.submittedAt ? sub.submittedAt.toDate().toLocaleString('vi-VN') : 'Vừa xong';
            const fileLink = sub.fileUrl ? `<a href="${sub.fileUrl}" target="_blank" style="color:var(--primary); font-weight:500;"><i class="fa-solid fa-file-arrow-down"></i> Tải bài làm</a>` : '';
            html += `<div style="border-bottom: 1px solid #eee; padding: 12px 0;">
                    <div style="font-weight:600; color:var(--text-main); font-size:1rem;">${sub.name} <span style="font-weight:400; font-size:0.85rem; color:var(--text-muted); margin-left:10px;">${time}</span></div>
                    <div style="font-size:0.95rem; margin: 5px 0;">${sub.text || 'Không có ghi chú'}</div>
                    ${fileLink}
                </div>`;
        });
        listContainer.innerHTML = html;
    } catch(err) { console.error(err); listContainer.innerHTML = `<div style="color:var(--danger); padding:20px;">Lỗi tải dữ liệu.</div>`; }
};

// ==========================================
// THÔNG BÁO TỪ LEADER (COURSE ANNOUNCEMENTS)
// ==========================================
document.getElementById('submit-announcement').addEventListener('click', async () => {
    const text = document.getElementById('announce-content').value;
    if (!text.trim()) return;
    document.getElementById('submit-announcement').disabled = true;
    await addDoc(collection(db, "course_announcements"), { courseId: currentCourseId, text: text, uid: currentUser.uid, name: currentUser.displayName, photoURL: currentUser.photoURL, comments: [], createdAt: serverTimestamp() });
    document.getElementById('announce-content').value = ''; document.getElementById('submit-announcement').disabled = false;
});
window.deleteAnnouncement = async (id) => { if(confirm("Xóa thông báo này?")) await deleteDoc(doc(db, "course_announcements", id)); };
window.addAnnounceComment = async (announceId) => {
    if (!currentUser) return alert("Vui lòng đăng nhập!");
    const input = document.getElementById(`announce-cmt-input-${announceId}`);
    if (!input || !input.value.trim()) return;
    try { await updateDoc(doc(db, "course_announcements", announceId), { comments: arrayUnion({ uid: currentUser.uid, name: currentUser.displayName, photoURL: currentUser.photoURL || "", text: input.value.trim(), time: Date.now() }) }); input.value = ''; } catch (error) { console.error(error); }
};

// ==========================================
// MODAL CHỈNH SỬA KHÓA HỌC
// ==========================================
window.openEditCourseModal = function() {
    if (!window.currentCourseData) return;
    document.getElementById('edit-c-title').value = window.currentCourseData.title || '';
    document.getElementById('edit-c-code').value = window.currentCourseData.code || '';
    document.getElementById('edit-c-date').value = window.currentCourseData.date || '';
    document.getElementById('edit-course-modal').style.display = 'flex';
};
document.getElementById('save-edit-course-btn').addEventListener('click', async () => {
    if (!currentCourseId) return;
    const newTitle = document.getElementById('edit-c-title').value.trim(); const newCode = document.getElementById('edit-c-code').value.trim(); const newDate = document.getElementById('edit-c-date').value.trim(); const fileInput = document.getElementById('edit-c-image'); const saveBtn = document.getElementById('save-edit-course-btn');
    if (!newTitle) return alert("Tên khóa học không được để trống!");
    saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải...';
    let updateData = { title: newTitle, code: newCode, date: newDate };
    try {
        if (fileInput.files.length > 0) { 
            const imgUrl = await uploadFileToDrive(fileInput.files[0]);
            if (imgUrl) updateData.imageUrl = imgUrl; 
        }
        await updateDoc(doc(db, "courses", currentCourseId), updateData); alert("Cập nhật thông tin thành công!"); document.getElementById('edit-course-modal').style.display = 'none';
    } catch (error) { alert("Có lỗi xảy ra, vui lòng thử lại!"); } finally { saveBtn.disabled = false; saveBtn.textContent = "Lưu thay đổi"; fileInput.value = ''; }
});

// ==========================================
// QUẢN LÝ DANH SÁCH LỚP HỌC & BẢO MẬT THÔNG TIN
// ==========================================
async function renderStudentTable(courseId, emails, leaders, canEdit) {
    const tbody = document.getElementById('student-table-body'); 
    tbody.innerHTML = '<tr><td colspan="4" class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách...</td></tr>'; 
    document.getElementById('th-action').style.display = canEdit ? 'table-cell' : 'none';
    
    const isAdmin = currentUser.email === ADMIN_EMAIL;
    let html = '';
    
    for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        const uData = await fetchUserByEmail(email);
        const isLd = leaders.includes(email); 
        const roleBadge = isLd ? `<span class="badge-leader"><i class="fa-solid fa-star"></i> Leader</span>` : `<span class="badge-student"><i class="fa-solid fa-user"></i> Sinh viên</span>`; 
        
        let displayInfo = `<div style="font-weight:600;">${uData.name}</div><div style="font-size:0.85rem; color:var(--text-muted);">MSSV: ${uData.mssv || 'N/A'}</div>`;
        if (isAdmin || canEdit) {
            displayInfo += `<div style="font-size:0.85rem; color:var(--primary);">${email}</div>`;
        }

        let actionTd = '';
        if (canEdit) {
            let actionBtn = '';
            
            if (isAdmin) {
                actionBtn = isLd ? `<button class="btn-icon" title="Hủy Leader" onclick="toggleLeader('${courseId}','${email}', false)"><i class="fa-solid fa-arrow-down" style="color:var(--warning)"></i></button>` 
                                 : `<button class="btn-icon" title="Cấp quyền Leader" onclick="toggleLeader('${courseId}','${email}', true)"><i class="fa-solid fa-crown" style="color:var(--warning)"></i></button>`;
            }
            
            let kickBtn = '';
            if (isAdmin || !isLd) {
                kickBtn = `<button class="btn-icon" title="Đuổi khỏi lớp" onclick="kickStudent('${courseId}','${email}')"><i class="fa-solid fa-user-minus" style="color:var(--danger)"></i></button>`;
            }

            actionTd = `<td class="no-print text-center">${actionBtn}${kickBtn}</td>`;
        }
        html += `<tr><td class="text-center">${i + 1}</td><td>${displayInfo}</td><td>${roleBadge}</td>${actionTd}</tr>`;
    }
    tbody.innerHTML = html;
}

document.getElementById('btn-add-student').addEventListener('click', async () => { const email = document.getElementById('new-student-email').value.trim().toLowerCase(); if(!email) return; await updateDoc(doc(db, "courses", currentCourseId), { allowedEmails: arrayUnion(email) }); document.getElementById('new-student-email').value = ''; });

window.kickStudent = async (cId, email) => { if(confirm(`Xóa ${email} khỏi lớp?`)) { await updateDoc(doc(db, "courses", cId), { allowedEmails: arrayRemove(email), leaders: arrayRemove(email) }); } };

window.toggleLeader = async (cId, email, makeLeader) => { 
    if (currentUser.email !== ADMIN_EMAIL) {
        return alert("Lỗi quyền truy cập: Chỉ Admin hệ thống mới có thể chỉ định hoặc hủy Leader!");
    }
    const refDoc = doc(db, "courses", cId); 
    if(makeLeader) await updateDoc(refDoc, { leaders: arrayUnion(email) }); 
    else await updateDoc(refDoc, { leaders: arrayRemove(email) }); 
};

// ==========================================
// UPLOAD SLIDE & VIDEO CHAT 
// ==========================================
document.getElementById('submit-slide').addEventListener('click', async () => {
    const title = document.getElementById('slide-title').value; const fileInput = document.getElementById('slide-file-input');
    if(!title || fileInput.files.length === 0) return alert("Vui lòng nhập tiêu đề và chọn file slide!");
    
    alert("Đang tải file slide lên hệ thống Drive...");
    const file = fileInput.files[0];
    const fileUrl = await uploadFileToDrive(file);
    
    if (fileUrl) {
        await addDoc(collection(db, "course_slides"), { courseId: currentCourseId, title: title, fileName: file.name, url: fileUrl, createdAt: serverTimestamp() });
        document.getElementById('slide-title').value = ''; fileInput.value = ''; document.getElementById('slide-file-name').innerText = 'Chưa chọn file nào'; document.getElementById('form-up-slide').style.display = 'none'; alert("Đăng slide thành công!");
    } else {
        alert("Lỗi upload slide!");
    }
});
window.delSlide = async (id) => { if(confirm("Xóa slide này?")) await deleteDoc(doc(db, "course_slides", id)); };

document.getElementById('send-course-chat').addEventListener('click', async () => {
    const text = document.getElementById('c-chat-msg').value; const fileInput = document.getElementById('c-chat-file'); const status = document.getElementById('c-chat-upload-status'); const btn = document.getElementById('send-course-chat');
    if(!text.trim() && fileInput.files.length === 0) return; btn.disabled = true; let fileUrl = null, fileName = null;
    
    try {
        if (fileInput.files.length > 0) { 
            status.style.display = 'block'; 
            const file = fileInput.files[0]; fileName = file.name; 
            fileUrl = await uploadFileToDrive(file);
        }
        await addDoc(collection(db, "course_chats"), { courseId: currentCourseId, text, fileUrl, fileName, uid: currentUser.uid, name: currentUser.displayName, photoURL: currentUser.photoURL, createdAt: serverTimestamp() });
        document.getElementById('c-chat-msg').value = ''; fileInput.value = ''; status.style.display = 'none'; 
    } catch(err) {
        console.error("Lỗi chat:", err);
    } finally {
        btn.disabled = false;
    }
});
window.delCourseMsg = async (id) => { if(confirm("Gỡ tin nhắn này?")) await deleteDoc(doc(db, "course_chats", id)); };

document.getElementById('submit-record').addEventListener('click', async () => {
    const title = document.getElementById('record-title').value; const url = document.getElementById('record-url').value;
    if(!title || !url) return alert("Nhập đủ tên và link video!"); await addDoc(collection(db, "course_records"), { courseId: currentCourseId, title, url, createdAt: serverTimestamp() });
    document.getElementById('record-title').value = ''; document.getElementById('record-url').value = ''; document.getElementById('form-up-record').style.display = 'none';
});
window.delRecord = async (id) => { if(confirm("Xóa video này?")) await deleteDoc(doc(db, "course_records", id)); };

// ==========================================
// BẢNG TIN TOÀN CẦU (POSTS) TÍCH HỢP DRIVE
// ==========================================
document.getElementById('post-file').addEventListener('change', function(e) {
    if(e.target.files.length > 0) { document.getElementById('post-file-name').innerText = e.target.files[0].name; } 
    else { document.getElementById('post-file-name').innerText = ''; }
});

const submitPostBtn = document.getElementById('submit-post');
submitPostBtn.addEventListener('click', async () => {
    const text = document.getElementById('post-content').value;
    const fileInput = document.getElementById('post-file');
    const uploadStatus = document.getElementById('upload-status');
    if (!text.trim() && fileInput.files.length === 0) return alert("Vui lòng nhập nội dung hoặc đính kèm file!");
    
    submitPostBtn.disabled = true; let fileUrl = null, fileName = null;
    try {
        if (fileInput.files.length > 0) {
            uploadStatus.style.display = 'block'; 
            const file = fileInput.files[0]; fileName = file.name;
            fileUrl = await uploadFileToDrive(file);
        }
        await addDoc(collection(db, "posts"), { 
            text, fileUrl, fileName, uid: currentUser.uid, name: currentUser.displayName, photoURL: currentUser.photoURL, 
            likes: [], comments: [], createdAt: serverTimestamp() 
        });
        document.getElementById('post-content').value = ''; fileInput.value = ''; document.getElementById('post-file-name').innerText = '';
    } catch (e) { console.error(e); alert("Lỗi tải bài viết hoặc file!");
    } finally { uploadStatus.style.display = 'none'; submitPostBtn.disabled = false; }
});

onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc")), (snapshot) => {
    const postsList = document.getElementById('posts-list'); postsList.innerHTML = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data(); const postId = docSnap.id;
        const isOwnerOrAdmin = currentUser && (data.uid === currentUser.uid || currentUser.email === ADMIN_EMAIL);
        const actionBtns = isOwnerOrAdmin ? `<div><button class="btn-icon text-muted" onclick="editPost('${postId}', '${data.text}')"><i class="fa-solid fa-pen"></i></button><button class="btn-icon" style="color:var(--danger)" onclick="deletePost('${postId}')"><i class="fa-solid fa-trash"></i></button></div>` : '';
        const fileHtml = data.fileUrl ? `<div class="post-attachment"><i class="fa-solid fa-file-arrow-down fa-2x" style="color:var(--primary)"></i><a href="${data.fileUrl}" target="_blank" style="color: var(--text-main); font-weight:500; text-decoration: none;">${data.fileName || 'Tải xuống tệp đính kèm'}</a></div>` : '';
        const likesCount = data.likes ? data.likes.length : 0; const isLiked = currentUser && data.likes && data.likes.includes(currentUser.uid);
        const avatar = data.photoURL || `https://ui-avatars.com/api/?name=${data.name}&background=random`;
        
        let commentsHtml = '';
        if (data.comments && data.comments.length > 0) {
            data.comments.forEach(c => {
                const cAvatar = c.photoURL || `https://ui-avatars.com/api/?name=${c.name}&background=random`;
                commentsHtml += `<div class="comment-item" style="display:flex; gap:8px; margin-bottom:10px;"><img src="${cAvatar}" class="avatar-sm"><div class="comment-bubble" style="background:#f0f2f5; padding:8px 12px; border-radius:18px;"><div style="font-weight:600; font-size:0.85rem;">${c.name}</div><div style="font-size:0.9rem;">${c.text}</div></div></div>`;
            });
        }

        postsList.innerHTML += `<div class="modern-card post"><div class="post-header"><div style="display:flex; align-items:center; gap:10px;"><img src="${avatar}" class="avatar-sm"><div><span class="post-author-name">${data.name}</span><span class="post-time"><i class="fa-solid fa-earth-americas"></i> Vừa xong</span></div></div>${actionBtns}</div><div class="post-content" style="margin-bottom:15px;">${data.text}</div>${fileHtml}<div class="post-actions" style="display:flex; border-top:1px solid #eee; border-bottom:1px solid #eee; padding:4px 0; margin-top:10px;"><button class="btn-action" style="flex:1; background:none; border:none; padding:8px; font-weight:600; cursor:pointer; color: ${isLiked ? 'var(--primary)' : 'var(--text-muted)'};" onclick="toggleLike('${postId}', ${isLiked})"><i class="fa-${isLiked ? 'solid' : 'regular'} fa-thumbs-up"></i> Thích (${likesCount})</button><button class="btn-action" style="flex:1; background:none; border:none; padding:8px; font-weight:600; cursor:pointer; color: var(--text-muted);" onclick="document.getElementById('cmt-input-${postId}').focus()"><i class="fa-regular fa-message"></i> Bình luận</button></div><div class="comment-section" style="padding-top:15px;">${commentsHtml}${currentUser ? `<div style="display:flex; gap:8px; margin-top:10px; align-items:center;"><img src="${currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName}&background=random`}" class="avatar-sm"><input type="text" id="cmt-input-${postId}" style="margin:0; border-radius:20px; padding:10px 15px; flex:1; border:none; background:#f0f2f5;" placeholder="Viết bình luận..." onkeypress="if(event.key==='Enter') addComment('${postId}')"></div>` : ''}</div></div>`;
    });
});
window.editPost = async (id, oldText) => { const newText = prompt("Sửa nội dung:", oldText); if (newText) await updateDoc(doc(db, "posts", id), { text: newText }); };
window.deletePost = async (id) => { if(confirm("Xóa bài viết này?")) await deleteDoc(doc(db, "posts", id)); };
window.toggleLike = async (postId, isLiked) => { if (!currentUser) return alert("Vui lòng đăng nhập!"); const postRef = doc(db, "posts", postId); try { await updateDoc(postRef, { likes: isLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid) }); } catch (error) { console.error(error); }};
window.addComment = async (postId) => { if (!currentUser) return alert("Vui lòng đăng nhập!"); const input = document.getElementById(`cmt-input-${postId}`); if (!input || !input.value.trim()) return; try { await updateDoc(doc(db, "posts", postId), { comments: arrayUnion({ uid: currentUser.uid, name: currentUser.displayName, photoURL: currentUser.photoURL || "", text: input.value.trim(), time: Date.now() }) }); input.value = ''; } catch (error) { console.error(error); }};

// ==========================================
// CHAT TOÀN CẦU (GLOBAL CHAT) TÍCH HỢP DRIVE
// ==========================================
document.getElementById('global-chat-img').addEventListener('change', function(e) {
    const preview = document.getElementById('g-chat-img-preview');
    if(e.target.files.length > 0) { preview.style.display = 'block'; preview.innerText = `Đã chọn ảnh: ${e.target.files[0].name}`; } 
    else { preview.style.display = 'none'; }
});

document.getElementById('send-global-chat').addEventListener('click', async () => {
    const chatMsg = document.getElementById('global-chat-msg');
    const fileInput = document.getElementById('global-chat-img');
    if (!chatMsg.value.trim() && fileInput.files.length === 0) return;
    
    document.getElementById('send-global-chat').disabled = true;
    let imgUrl = null;

    try {
        if(fileInput.files.length > 0) {
            imgUrl = await uploadFileToDrive(fileInput.files[0]);
        }
        await addDoc(collection(db, "chats"), { 
            text: chatMsg.value, imageUrl: imgUrl, 
            uid: currentUser.uid, name: currentUser.displayName, photoURL: currentUser.photoURL, 
            createdAt: serverTimestamp(), isDeleted: false 
        });
        chatMsg.value = ''; fileInput.value = ''; document.getElementById('g-chat-img-preview').style.display = 'none';
    } catch(err) {
        console.error(err); alert("Lỗi gửi tin nhắn!");
    } finally {
        document.getElementById('send-global-chat').disabled = false;
    }
});

window.deleteGlobalChat = async (id) => {
    if(confirm("Thu hồi tin nhắn này? (Sẽ để lại dấu vết đã thu hồi)")) {
        await updateDoc(doc(db, "chats", id), { isDeleted: true });
    }
};

onSnapshot(query(collection(db, "chats"), orderBy("createdAt", "asc")), (snapshot) => {
    const chatBox = document.getElementById('global-chat-box');
    if (!chatBox) return;
    chatBox.innerHTML = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data(); const isMe = currentUser && data.uid === currentUser.uid; const alignClass = isMe ? 'me' : 'user';
        const avatar = data.photoURL || `https://ui-avatars.com/api/?name=${data.name}&background=random`;
        
        let contentHtml = '';
        if (data.isDeleted) {
            contentHtml = `<div class="chat-bubble deleted"><i class="fa-solid fa-ban"></i> Tin nhắn đã bị thu hồi</div>`;
        } else {
            const imgHtml = data.imageUrl ? `<img src="${data.imageUrl}" class="chat-img-attachment" onclick="window.open('${data.imageUrl}')">` : '';
            const delBtn = isMe ? `<button class="btn-del-msg" onclick="deleteGlobalChat('${docSnap.id}')">Thu hồi</button>` : '';
            contentHtml = `
                <div>
                    <div class="chat-bubble">${data.text} ${imgHtml}</div>
                    ${delBtn}
                </div>`;
        }

        chatBox.innerHTML += `<div class="chat-message ${alignClass}">${!isMe ? `<div class="chat-author">${data.name}</div>` : ''}<div style="display: flex; gap: 8px; align-items: flex-end; ${isMe ? 'flex-direction: row-reverse;' : ''}"><img src="${avatar}" class="avatar-sm" style="width: 28px; height: 28px; object-fit: cover;">${contentHtml}</div></div>`;
    });
    chatBox.scrollTop = chatBox.scrollHeight;
});