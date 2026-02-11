// Family History Website - JavaScript (API-backed)

let photos = [];
let news = [];
let familyMembers = [];
let histories = [];

// DOM Elements
const photoUpload = document.getElementById('photo-upload');
const photoGallery = document.getElementById('photo-gallery');
const addNewsBtn = document.getElementById('add-news-btn');
const newsForm = document.getElementById('news-form');
const newsList = document.getElementById('news-list');
const addMemberBtn = document.getElementById('add-member-btn');
const memberForm = document.getElementById('member-form');
const familyTree = document.getElementById('family-tree');
const memberParentSelect = document.getElementById('member-parent');

// ========== DATA LOADING ==========

async function loadAll() {
    const [photosRes, newsRes, membersRes, historiesRes] = await Promise.all([
        fetch('/api/photos').then(r => r.json()),
        fetch('/api/news').then(r => r.json()),
        fetch('/api/members').then(r => r.json()),
        fetch('/api/histories').then(r => r.json())
    ]);
    photos = photosRes;
    news = newsRes;
    familyMembers = membersRes;
    histories = historiesRes;

    renderPhotos();
    renderNews();
    renderFamilyTree();
    renderHistories();
}

// ========== PHOTO GALLERY ==========

photoUpload.addEventListener('change', handlePhotoUpload);

async function handlePhotoUpload(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const formData = new FormData();
    files.forEach(file => formData.append('photos', file));

    const res = await fetch('/api/photos', { method: 'POST', body: formData });
    const newPhotos = await res.json();
    photos = newPhotos.concat(photos);
    renderPhotos();
    e.target.value = '';
}

function renderPhotos() {
    if (photos.length === 0) {
        photoGallery.innerHTML = '<p class="empty-message">No photos yet. Click "Add Photos" to upload your family memories.</p>';
        return;
    }

    photoGallery.innerHTML = photos.map(photo => `
        <div class="gallery-item" data-id="${photo.id}">
            <img src="/uploads/${photo.filename}" alt="${escapeHtml(photo.caption || photo.original_name)}" onclick="openLightbox('/uploads/${photo.filename}')">
            <button class="delete-btn" onclick="deletePhoto(${photo.id})">X</button>
            <div class="caption" onclick="editCaption(${photo.id})">
                ${photo.caption ? escapeHtml(photo.caption) : '<span class="caption-placeholder">+ Add caption</span>'}
            </div>
        </div>
    `).join('');
}

async function deletePhoto(id) {
    if (confirm('Delete this photo?')) {
        await fetch(`/api/photos/${id}`, { method: 'DELETE' });
        photos = photos.filter(p => p.id !== id);
        renderPhotos();
    }
}

function openLightbox(src) {
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.innerHTML = `<img src="${src}" alt="Full size photo">`;
    lightbox.onclick = () => lightbox.remove();
    document.body.appendChild(lightbox);
}

async function editCaption(id) {
    const photo = photos.find(p => p.id === id);
    if (!photo) return;

    const newCaption = prompt('Enter a caption:', photo.caption || '');
    if (newCaption === null) return;

    photo.caption = newCaption.trim();
    await fetch(`/api/photos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: photo.caption })
    });
    renderPhotos();
}

// ========== FAMILY NEWS ==========

addNewsBtn.addEventListener('click', () => {
    newsForm.classList.remove('hidden');
    document.getElementById('news-date').valueAsDate = new Date();
});

document.getElementById('cancel-news').addEventListener('click', () => {
    newsForm.classList.add('hidden');
    clearNewsForm();
});

document.getElementById('save-news').addEventListener('click', async () => {
    const title = document.getElementById('news-title').value.trim();
    const date = document.getElementById('news-date').value;
    const content = document.getElementById('news-content').value.trim();

    if (!title || !content) {
        alert('Please fill in the title and content.');
        return;
    }

    const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, date, content })
    });
    const newsItem = await res.json();
    news.unshift(newsItem);
    renderNews();
    newsForm.classList.add('hidden');
    clearNewsForm();
});

function clearNewsForm() {
    document.getElementById('news-title').value = '';
    document.getElementById('news-date').value = '';
    document.getElementById('news-content').value = '';
}

function renderNews() {
    if (news.length === 0) {
        newsList.innerHTML = '<p class="empty-message">No news yet. Click "Add News" to share family updates.</p>';
        return;
    }

    newsList.innerHTML = news.map(item => `
        <div class="news-item" data-id="${item.id}">
            <button class="delete-btn" onclick="deleteNews(${item.id})">Delete</button>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="date">${formatDate(item.date)}</p>
            <p>${escapeHtml(item.content)}</p>
        </div>
    `).join('');
}

async function deleteNews(id) {
    if (confirm('Delete this news item?')) {
        await fetch(`/api/news/${id}`, { method: 'DELETE' });
        news = news.filter(n => n.id !== id);
        renderNews();
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// ========== FAMILY TREE ==========

let editingMemberId = null;

addMemberBtn.addEventListener('click', () => {
    editingMemberId = null;
    clearMemberForm();
    memberForm.classList.remove('hidden');
    updateParentSelect();
});

document.getElementById('cancel-member').addEventListener('click', () => {
    memberForm.classList.add('hidden');
    clearMemberForm();
});

document.getElementById('save-member').addEventListener('click', async () => {
    const name = document.getElementById('member-name').value.trim();
    const birth = document.getElementById('member-birth').value.trim();
    const death = document.getElementById('member-death').value.trim();
    const generation = parseInt(document.getElementById('member-generation').value);
    const parent_id = document.getElementById('member-parent').value;
    const spouse = document.getElementById('member-spouse').value.trim();

    if (!name) {
        alert('Please enter a name.');
        return;
    }

    const data = { name, birth, death, generation, parent_id: parent_id ? parseInt(parent_id) : null, spouse };

    if (editingMemberId) {
        await fetch(`/api/members/${editingMemberId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const index = familyMembers.findIndex(m => m.id === editingMemberId);
        if (index !== -1) familyMembers[index] = { ...familyMembers[index], ...data };
        editingMemberId = null;
    } else {
        const res = await fetch('/api/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const member = await res.json();
        familyMembers.push(member);
    }

    renderFamilyTree();
    memberForm.classList.add('hidden');
    clearMemberForm();
});

function clearMemberForm() {
    editingMemberId = null;
    document.getElementById('member-name').value = '';
    document.getElementById('member-birth').value = '';
    document.getElementById('member-death').value = '';
    document.getElementById('member-generation').value = '0';
    document.getElementById('member-parent').value = '';
    document.getElementById('member-spouse').value = '';
}

function updateParentSelect(excludeId) {
    const options = ['<option value="">-- Select Parent (optional) --</option>'];
    familyMembers.forEach(member => {
        if (member.id !== excludeId) {
            options.push(`<option value="${member.id}">${member.name}</option>`);
        }
    });
    memberParentSelect.innerHTML = options.join('');
}

function renderFamilyTree() {
    if (familyMembers.length === 0) {
        familyTree.innerHTML = '<p class="empty-message">No family members yet. Click "Add Family Member" to start building your tree.</p>';
        return;
    }

    const generations = {};
    familyMembers.forEach(member => {
        const gen = member.generation || 0;
        if (!generations[gen]) generations[gen] = [];
        generations[gen].push(member);
    });

    const sortedGens = Object.keys(generations).sort((a, b) => a - b);

    familyTree.innerHTML = sortedGens.map(gen => `
        <div class="tree-generation" data-gen="${gen}">
            ${generations[gen].map(member => `
                <div class="tree-member ${member.spouse ? 'has-spouse' : ''}" data-id="${member.id}">
                    <button class="delete-btn" onclick="deleteMember(${member.id})">X</button>
                    <button class="edit-btn" onclick="editMember(${member.id})">Edit</button>
                    <h4>${escapeHtml(member.name)}</h4>
                    <p class="years">${formatYears(member.birth, member.death)}</p>
                    ${member.spouse ? `<p class="spouse">& ${escapeHtml(member.spouse)}</p>` : ''}
                </div>
            `).join('')}
        </div>
    `).join('');
}

function editMember(id) {
    const member = familyMembers.find(m => m.id === id);
    if (!member) return;

    editingMemberId = id;
    document.getElementById('member-name').value = member.name || '';
    document.getElementById('member-birth').value = member.birth || '';
    document.getElementById('member-death').value = member.death || '';
    document.getElementById('member-generation').value = member.generation || 0;
    document.getElementById('member-spouse').value = member.spouse || '';

    updateParentSelect(id);
    document.getElementById('member-parent').value = member.parent_id || '';

    memberForm.classList.remove('hidden');
    memberForm.scrollIntoView({ behavior: 'smooth' });
}

async function deleteMember(id) {
    if (confirm('Delete this family member?')) {
        await fetch(`/api/members/${id}`, { method: 'DELETE' });
        familyMembers = familyMembers.filter(m => m.id !== id);
        renderFamilyTree();
    }
}

function formatYears(birth, death) {
    if (!birth && !death) return '';
    if (birth && death) return `${birth} - ${death}`;
    if (birth) return `b. ${birth}`;
    return `d. ${death}`;
}

// ========== FAMILY HISTORY ==========

const addHistoryBtn = document.getElementById('add-history-btn');
const historyForm = document.getElementById('history-form');
const historyList = document.getElementById('history-list');
let editingHistoryId = null;

addHistoryBtn.addEventListener('click', () => {
    editingHistoryId = null;
    clearHistoryForm();
    historyForm.classList.remove('hidden');
});

document.getElementById('cancel-history').addEventListener('click', () => {
    historyForm.classList.add('hidden');
    clearHistoryForm();
});

document.getElementById('save-history').addEventListener('click', async () => {
    const title = document.getElementById('history-title').value.trim();
    const era = document.getElementById('history-era').value.trim();
    const content = document.getElementById('history-content').value.trim();

    if (!title || !content) {
        alert('Please fill in the title and story.');
        return;
    }

    if (editingHistoryId) {
        await fetch(`/api/histories/${editingHistoryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, era, content })
        });
        const index = histories.findIndex(h => h.id === editingHistoryId);
        if (index !== -1) histories[index] = { ...histories[index], title, era, content };
        editingHistoryId = null;
    } else {
        const res = await fetch('/api/histories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, era, content })
        });
        const story = await res.json();
        histories.unshift(story);
    }

    renderHistories();
    historyForm.classList.add('hidden');
    clearHistoryForm();
});

function clearHistoryForm() {
    editingHistoryId = null;
    document.getElementById('history-title').value = '';
    document.getElementById('history-era').value = '';
    document.getElementById('history-content').value = '';
}

function renderHistories() {
    if (histories.length === 0) {
        historyList.innerHTML = '<p class="empty-message">No stories yet. Click "Add Story" to preserve your family\'s history.</p>';
        return;
    }

    historyList.innerHTML = histories.map(item => `
        <div class="history-item" data-id="${item.id}">
            <div class="history-actions">
                <button class="edit-btn" onclick="editHistory(${item.id})">Edit</button>
                <button class="delete-btn" onclick="deleteHistory(${item.id})">Delete</button>
            </div>
            ${item.era ? `<span class="history-era">${escapeHtml(item.era)}</span>` : ''}
            <h3>${escapeHtml(item.title)}</h3>
            <p class="history-content">${escapeHtml(item.content)}</p>
        </div>
    `).join('');
}

function editHistory(id) {
    const item = histories.find(h => h.id === id);
    if (!item) return;

    editingHistoryId = id;
    document.getElementById('history-title').value = item.title || '';
    document.getElementById('history-era').value = item.era || '';
    document.getElementById('history-content').value = item.content || '';

    historyForm.classList.remove('hidden');
    historyForm.scrollIntoView({ behavior: 'smooth' });
}

async function deleteHistory(id) {
    if (confirm('Delete this story?')) {
        await fetch(`/api/histories/${id}`, { method: 'DELETE' });
        histories = histories.filter(h => h.id !== id);
        renderHistories();
    }
}

// ========== UTILITIES ==========

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Smooth scrolling for navigation
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href');
        document.querySelector(targetId).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

// ========== INITIAL LOAD ==========
loadAll();
