import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, where, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, getDoc } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyC5-lQjrxIUjW9bqbr9UHD4s4fIsCvF6iw",
  authDomain: "vanilms.firebaseapp.com",
  projectId: "vanilms",
  storageBucket: "vanilms.firebasestorage.app",
  messagingSenderId: "269688828853",
  appId: "1:269688828853:web:9a333301de72cd2f401ffc"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); 

let currentUser = null;
const ADMIN_EMAIL = "nguyennhatquanyb@gmail.com"; 

let currentCourseId = null;
let unsubscribeCourseChats = null;
let unsubscribeCourseRecords = null;
let unsubscribeCurrentCourseInfo = null;

// ==========================================
// ĐIỀU HƯỚNG & XÁC THỰC
// ==========================================
window.showPage = function(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    document.querySelectorAll('.modern-nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.modern-nav button[onclick="showPage('${pageId}')"]`);
    if(activeBtn) activeBtn.classList.add('active');
};

document.getElementById('login-btn').addEventListener('click', () => signInWithPopup(auth, new GoogleAuthProvider()));
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
        document.getElementById('login-btn').style.display = 'none';
        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('username').textContent = user.displayName;
        const avatar = user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`;
        document.getElementById('user-avatar').src = avatar;
        document.getElementById('composer-avatar').src = avatar;
        
        document.getElementById('post-form-container').style.display = 'block';
        document.getElementById('global-chat-input-container').style.display = 'flex';
        document.getElementById('nav-admin').style.display = (user.email === ADMIN_EMAIL) ? 'block' : 'none';
        
        loadCourses(user.email);
    } else {
        document.getElementById('login-btn').style.display = 'inline-flex';
        document.getElementById('user-info').style.display = 'none';
        document.getElementById('post-form-container').style.display = 'none';
        document.getElementById('global-chat-input-container').style.display = 'none';
        document.getElementById('nav-admin').style.display = 'none';
        document.getElementById('course-list').innerHTML = '<div class="empty-state">Vui lòng đăng nhập để xem.</div>';
    }
});

// ==========================================
// 1. QUẢN LÝ KHÓA HỌC (TỔNG)
// ==========================================
document.getElementById('create-course-btn').addEventListener('click', async () => {
    const title = document.getElementById('course-title').value;
    const code = document.getElementById('course-code').value;
    const date = document.getElementById('course-date').value;
    const emails = document.getElementById('course-emails').value.split(',').map(e => e.trim().toLowerCase()).filter(e => e !== '');
    
    if (!title) return alert("Nhập tên khóa học!");
    await addDoc(collection(db, "courses"), { 
        title, code, date, 
        allowedEmails: emails, 
        leaders: [],
        createdAt: serverTimestamp() 
    });
    alert("Tạo khóa học thành công!");
});

function loadCourses(userEmail) {
    const courseList = document.getElementById('course-list');
    let q = (userEmail === ADMIN_EMAIL) 
        ? query(collection(db, "courses"), orderBy("createdAt", "desc"))
        : query(collection(db, "courses"), where("allowedEmails", "array-contains", userEmail.toLowerCase()));
    
    onSnapshot(q, (snapshot) => {
        courseList.innerHTML = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const cid = docSnap.id;
            const adminBtns = (userEmail === ADMIN_EMAIL) ? `
                <div class="admin-course-actions">
                    <button class="btn-icon" style="background: white;" onclick="deleteCourse('${cid}')"><i class="fa-solid fa-trash" style="color:var(--danger)"></i></button>
                </div>` : '';

            courseList.innerHTML += `
                <div class="course-card">
                    ${adminBtns}
                    <img src="https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=600&q=80" class="course-thumb">
                    <div class="course-info">
                        <div class="course-title">${data.title}</div>
                        <div class="course-meta"><span><i class="fa-solid fa-tag"></i> ${data.code}</span></div>
                        <button class="btn-primary w-100" style="margin-top:auto; justify-content:center;" onclick="openCourse('${cid}', '${data.title}')">Vào lớp</button>
                    </div>
                </div>`;
        });
    });
}

window.deleteCourse = async (id) => { if(confirm("Xóa khóa học này?")) await deleteDoc(doc(db, "courses", id)); };


// ==========================================
// 2. CHI TIẾT KHÓA HỌC (LMS MODULES)
// ==========================================
window.openCourse = function(courseId, courseTitle) {
    currentCourseId = courseId;
    document.getElementById('c-brand-name').innerText = courseTitle;
    showPage('course-detail');
    
    switchCourseTab('chat', document.querySelector('.sidebar-module'));

    if(unsubscribeCourseChats) unsubscribeCourseChats();
    if(unsubscribeCourseRecords) unsubscribeCourseRecords();
    if(unsubscribeCurrentCourseInfo) unsubscribeCurrentCourseInfo();

    // Lắng nghe dữ liệu khóa học
    unsubscribeCurrentCourseInfo = onSnapshot(doc(db, "courses", courseId), (docSnap) => {
        const cData = docSnap.data();
        if(!cData) return;
        
        const isGlobalAdmin = currentUser && currentUser.email === ADMIN_EMAIL;
        const leaders = cData.leaders || [];
        const isLeader = currentUser && leaders.includes(currentUser.email);
        
        // Quyền sửa khóa học
        const canEdit = isGlobalAdmin || isLeader;
        
        document.getElementById('btn-show-up-record').style.display = canEdit ? 'inline-flex' : 'none';
        document.getElementById('admin-add-student-area').style.display = canEdit ? 'flex' : 'none';

        renderStudentTable(courseId, cData.allowedEmails || [], leaders, canEdit);
    });

    const qChat = query(collection(db, "course_chats"), where("courseId", "==", courseId));
    unsubscribeCourseChats = onSnapshot(qChat, (snapshot) => {
        const box = document.getElementById('course-chat-box');
        box.innerHTML = '';
        snapshot.forEach(d => {
            const msg = d.data();
            const isMe = currentUser && msg.uid === currentUser.uid;
            const isAdmin = currentUser && currentUser.email === ADMIN_EMAIL;
            const avatar = msg.photoURL || `https://ui-avatars.com/api/?name=${msg.name}`;
            
            const fileHtml = msg.fileUrl ? `<div class="msg-file">📎 <a href="${msg.fileUrl}" target="_blank">${msg.fileName}</a></div>` : '';
            const delBtn = (isMe || isAdmin) ? `<button class="btn-del-msg" onclick="delCourseMsg('${d.id}')">Gỡ tin nhắn</button>` : '';

            box.innerHTML += `
                <div class="chat-message ${isMe ? 'me' : 'user'}">
                    ${!isMe ? `<div class="chat-author">${msg.name}</div>` : ''}
                    <div style="display: flex; gap:8px; align-items:flex-end; ${isMe ? 'flex-direction:row-reverse;' : ''}">
                        <img src="${avatar}" class="avatar-sm" style="width:28px; height:28px;">
                        <div>
                            <div class="chat-bubble">${msg.text} ${fileHtml}</div>
                            ${delBtn}
                        </div>
                    </div>
                </div>`;
        });
        box.scrollTop = box.scrollHeight; 
    });

    const qRec = query(collection(db, "course_records"), where("courseId", "==", courseId));
    unsubscribeCourseRecords = onSnapshot(qRec, (snapshot) => {
        const list = document.getElementById('course-records-list');
        list.innerHTML = '';
        snapshot.forEach(d => {
            const rec = d.data();
            const isGlobalAdmin = currentUser && currentUser.email === ADMIN_EMAIL;
            const leaders = rec.leaders || [];
            const canEdit = isGlobalAdmin || (currentUser && leaders.includes(currentUser.email));

            const delBtn = canEdit ? `<button class="btn-danger w-100" style="margin-top:10px;" onclick="delRecord('${d.id}')">Xóa Video</button>` : '';
            
            list.innerHTML += `
                <div class="modern-card" style="padding: 15px;">
                    <div style="font-weight: 600; margin-bottom: 10px;">${rec.title}</div>
                    <a href="${rec.url}" target="_blank" class="btn-primary w-100" style="justify-content:center;"><i class="fa-brands fa-youtube"></i> Xem Video</a>
                    ${delBtn}
                </div>`;
        });
    });
};

window.switchCourseTab = function(tabId, element) {
    if(element) {
        document.querySelectorAll('.sidebar-module').forEach(el => el.classList.remove('active'));
        element.classList.add('active');
    }
    document.querySelectorAll('.c-tab-content').forEach(c => c.style.display = 'none');
    document.getElementById(`c-tab-${tabId}`).style.display = 'block';
};


// ==========================================
// QUẢN LÝ LỚP HỌC (RENDER CHUẨN UI)
// ==========================================
function renderStudentTable(courseId, emails, leaders, canEdit) {
    const tbody = document.getElementById('student-table-body');
    tbody.innerHTML = '';
    
    // Bật tắt cột hành động
    document.getElementById('th-action').style.display = canEdit ? 'table-cell' : 'none';

    emails.forEach((email, index) => {
        const isLd = leaders.includes(email);
        const roleBadge = isLd ? `<span class="badge-leader"><i class="fa-solid fa-star"></i> Leader</span>` : `<span class="badge-student"><i class="fa-solid fa-user"></i> Sinh viên</span>`;
        
        let actionTd = '';
        if (canEdit) {
            const actionBtn = isLd 
                ? `<button class="btn-icon" title="Hủy Leader" onclick="toggleLeader('${courseId}','${email}', false)"><i class="fa-solid fa-arrow-down" style="color:var(--warning)"></i></button>`
                : `<button class="btn-icon" title="Cấp quyền Leader" onclick="toggleLeader('${courseId}','${email}', true)"><i class="fa-solid fa-crown" style="color:var(--warning)"></i></button>`;

            actionTd = `
            <td class="no-print text-center">
                ${actionBtn}
                <button class="btn-icon" title="Đuổi khỏi lớp" onclick="kickStudent('${courseId}','${email}')"><i class="fa-solid fa-user-minus" style="color:var(--danger)"></i></button>
            </td>`;
        }

        tbody.innerHTML += `
            <tr>
                <td class="text-center">${index + 1}</td>
                <td><strong>${email}</strong></td>
                <td>${roleBadge}</td>
                ${actionTd}
            </tr>`;
    });
}

document.getElementById('btn-add-student').addEventListener('click', async () => {
    const email = document.getElementById('new-student-email').value.trim().toLowerCase();
    if(!email) return;
    await updateDoc(doc(db, "courses", currentCourseId), { allowedEmails: arrayUnion(email) });
    document.getElementById('new-student-email').value = '';
});

window.kickStudent = async (cId, email) => {
    if(confirm(`Xóa ${email} khỏi lớp?`)) {
        await updateDoc(doc(db, "courses", cId), { 
            allowedEmails: arrayRemove(email),
            leaders: arrayRemove(email)
        });
    }
};

window.toggleLeader = async (cId, email, makeLeader) => {
    const refDoc = doc(db, "courses", cId);
    if(makeLeader) await updateDoc(refDoc, { leaders: arrayUnion(email) });
    else await updateDoc(refDoc, { leaders: arrayRemove(email) });
};


// ==========================================
// GỬI CHAT LỚP & UPLOAD VIDEO
// ==========================================
document.getElementById('send-course-chat').addEventListener('click', async () => {
    const text = document.getElementById('c-chat-msg').value;
    const fileInput = document.getElementById('c-chat-file');
    const status = document.getElementById('c-chat-upload-status');
    const btn = document.getElementById('send-course-chat');
    
    if(!text.trim() && fileInput.files.length === 0) return;
    btn.disabled = true;
    
    let fileUrl = null, fileName = null;
    if (fileInput.files.length > 0) {
        status.style.display = 'block';
        const file = fileInput.files[0];
        fileName = file.name;
        const sRef = ref(storage, 'course_files/' + Date.now() + '_' + file.name);
        await uploadBytes(sRef, file);
        fileUrl = await getDownloadURL(sRef);
    }

    await addDoc(collection(db, "course_chats"), {
        courseId: currentCourseId, text, fileUrl, fileName,
        uid: currentUser.uid, name: currentUser.displayName, photoURL: currentUser.photoURL,
        createdAt: serverTimestamp()
    });

    document.getElementById('c-chat-msg').value = '';
    fileInput.value = '';
    status.style.display = 'none';
    btn.disabled = false;
});

window.delCourseMsg = async (id) => { if(confirm("Gỡ tin nhắn này?")) await deleteDoc(doc(db, "course_chats", id)); };

document.getElementById('submit-record').addEventListener('click', async () => {
    const title = document.getElementById('record-title').value;
    const url = document.getElementById('record-url').value;
    if(!title || !url) return alert("Nhập đủ tên và link video!");
    
    await addDoc(collection(db, "course_records"), {
        courseId: currentCourseId, title, url,
        createdAt: serverTimestamp()
    });
    document.getElementById('record-title').value = '';
    document.getElementById('record-url').value = '';
    document.getElementById('form-up-record').style.display = 'none';
});
window.delRecord = async (id) => { if(confirm("Xóa video này?")) await deleteDoc(doc(db, "course_records", id)); };


// ==========================================
// BẢNG TIN TOÀN CẦU
// ==========================================
const submitPostBtn = document.getElementById('submit-post');
submitPostBtn.addEventListener('click', async () => {
    const text = document.getElementById('post-content').value;
    const fileInput = document.getElementById('post-file');
    const uploadStatus = document.getElementById('upload-status');
    
    if (!text.trim() && fileInput.files.length === 0) return;
    submitPostBtn.disabled = true;
    let fileUrl = null, fileName = null;
    
    if (fileInput.files.length > 0) {
        uploadStatus.style.display = 'block';
        const file = fileInput.files[0];
        fileName = file.name;
        const storageRef = ref(storage, 'posts/' + Date.now() + '_' + file.name);
        await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(storageRef);
    }

    await addDoc(collection(db, "posts"), {
        text, fileUrl, fileName,
        uid: currentUser.uid, name: currentUser.displayName, photoURL: currentUser.photoURL,
        likes: [], comments: [],
        createdAt: serverTimestamp()
    });

    document.getElementById('post-content').value = '';
    fileInput.value = '';
    uploadStatus.style.display = 'none';
    submitPostBtn.disabled = false;
});

onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc")), (snapshot) => {
    const postsList = document.getElementById('posts-list');
    postsList.innerHTML = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const postId = docSnap.id;
        const isOwnerOrAdmin = currentUser && (data.uid === currentUser.uid || currentUser.email === ADMIN_EMAIL);
        
        const actionBtns = isOwnerOrAdmin ? `
            <div>
                <button class="btn-icon text-muted" onclick="editPost('${postId}', '${data.text}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon" style="color:var(--danger)" onclick="deletePost('${postId}')"><i class="fa-solid fa-trash"></i></button>
            </div>` : '';

        const fileHtml = data.fileUrl ? `
            <div class="post-attachment">
                <i class="fa-solid fa-file-arrow-down fa-2x" style="color:var(--primary)"></i>
                <a href="${data.fileUrl}" target="_blank" style="color: var(--text-main); font-weight:500; text-decoration: none;">${data.fileName || 'Tải xuống tệp đính kèm'}</a>
            </div>` : '';

        const likesCount = data.likes ? data.likes.length : 0;
        const isLiked = currentUser && data.likes && data.likes.includes(currentUser.uid);
        const avatar = data.photoURL || `https://ui-avatars.com/api/?name=${data.name}&background=random`;
        
        let commentsHtml = '';
        if (data.comments && data.comments.length > 0) {
            data.comments.forEach(c => {
                const cAvatar = c.photoURL || `https://ui-avatars.com/api/?name=${c.name}&background=random`;
                commentsHtml += `
                <div class="comment-item" style="display:flex; gap:8px; margin-bottom:10px;">
                    <img src="${cAvatar}" class="avatar-sm">
                    <div class="comment-bubble" style="background:#f0f2f5; padding:8px 12px; border-radius:18px;">
                        <div style="font-weight:600; font-size:0.85rem;">${c.name}</div>
                        <div style="font-size:0.9rem;">${c.text}</div>
                    </div>
                </div>`;
            });
        }

        postsList.innerHTML += `
            <div class="modern-card post">
                <div class="post-header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${avatar}" class="avatar-sm">
                        <div>
                            <span class="post-author-name">${data.name}</span>
                            <span class="post-time"><i class="fa-solid fa-earth-americas"></i> Vừa xong</span>
                        </div>
                    </div>
                    ${actionBtns}
                </div>
                <div class="post-content" style="margin-bottom:15px;">${data.text}</div>
                ${fileHtml}
                
                <div class="post-actions" style="display:flex; border-top:1px solid #eee; border-bottom:1px solid #eee; padding:4px 0; margin-top:10px;">
                    <button class="btn-action" style="flex:1; background:none; border:none; padding:8px; font-weight:600; cursor:pointer; color: ${isLiked ? 'var(--primary)' : 'var(--text-muted)'};" onclick="toggleLike('${postId}', ${isLiked})">
                        <i class="fa-${isLiked ? 'solid' : 'regular'} fa-thumbs-up"></i> Thích (${likesCount})
                    </button>
                    <button class="btn-action" style="flex:1; background:none; border:none; padding:8px; font-weight:600; cursor:pointer; color: var(--text-muted);" onclick="document.getElementById('cmt-input-${postId}').focus()">
                        <i class="fa-regular fa-message"></i> Bình luận
                    </button>
                </div>

                <div class="comment-section" style="padding-top:15px;">
                    ${commentsHtml}
                    ${currentUser ? `
                    <div style="display:flex; gap:8px; margin-top:10px; align-items:center;">
                        <img src="${currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName}&background=random`}" class="avatar-sm">
                        <input type="text" id="cmt-input-${postId}" style="margin:0; border-radius:20px; padding:10px 15px; flex:1; border:none; background:#f0f2f5;" placeholder="Viết bình luận..." onkeypress="if(event.key==='Enter') addComment('${postId}')">
                    </div>` : ''}
                </div>
            </div>`;
    });
});

window.editPost = async (id, oldText) => { const newText = prompt("Sửa nội dung:", oldText); if (newText) await updateDoc(doc(db, "posts", id), { text: newText }); };
window.deletePost = async (id) => { if(confirm("Xóa bài viết này?")) await deleteDoc(doc(db, "posts", id)); };
window.toggleLike = async (postId, isLiked) => { if (!currentUser) return; await updateDoc(doc(db, "posts", postId), { likes: isLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid) }); };
window.addComment = async (postId) => {
    const input = document.getElementById(`cmt-input-${postId}`);
    if (!input.value.trim()) return;
    await updateDoc(doc(db, "posts", postId), {
        comments: arrayUnion({ uid: currentUser.uid, name: currentUser.displayName, photoURL: currentUser.photoURL, text: input.value, time: new Date().getTime() })
    });
    input.value = '';
};

// ==========================================
// CHAT TOÀN CẦU (GLOBAL CHAT)
// ==========================================
document.getElementById('send-global-chat').addEventListener('click', async () => {
    const chatMsg = document.getElementById('global-chat-msg');
    if (!chatMsg.value.trim()) return;
    
    await addDoc(collection(db, "chats"), { 
        text: chatMsg.value, 
        uid: currentUser.uid, 
        name: currentUser.displayName, 
        photoURL: currentUser.photoURL, 
        createdAt: serverTimestamp() 
    });
    chatMsg.value = '';
});

onSnapshot(query(collection(db, "chats"), orderBy("createdAt", "asc")), (snapshot) => {
    const chatBox = document.getElementById('global-chat-box');
    if (!chatBox) return;
    
    chatBox.innerHTML = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const isMe = currentUser && data.uid === currentUser.uid;
        const alignClass = isMe ? 'me' : 'user';
        const avatar = data.photoURL || `https://ui-avatars.com/api/?name=${data.name}&background=random`;
        
        chatBox.innerHTML += `
            <div class="chat-message ${alignClass}">
                ${!isMe ? `<div class="chat-author">${data.name}</div>` : ''}
                <div style="display: flex; gap: 8px; align-items: flex-end; ${isMe ? 'flex-direction: row-reverse;' : ''}">
                    <img src="${avatar}" class="avatar-sm" style="width: 28px; height: 28px; object-fit: cover;">
                    <div class="chat-bubble">${data.text}</div>
                </div>
            </div>`;
    });
    chatBox.scrollTop = chatBox.scrollHeight;
});