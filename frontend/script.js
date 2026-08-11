const API = "https://pigsty-backend.onrender.com";

let token = localStorage.getItem("pigsty_token");
let currentUser = null;
let allPosts = [];
let currentSort = "latest";
let searchInput = null;

const authArea = document.getElementById("authArea");


// =========================================================
// API
// =========================================================

async function apiFetch(url, options = {}) {

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(API + url, {
        ...options,
        headers
    });

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data.detail || `HTTP ${response.status}`
        );
    }

    return data;
}


// =========================================================
// Auth
// =========================================================

async function loadUser() {

    if (!token) {
        currentUser = null;
        updateAuthUI();
        updateAdminUI();
        return;
    }

    try {

        currentUser = await apiFetch(
            "/api/auth/me"
        );

    } catch {

        token = null;
        currentUser = null;

        localStorage.removeItem(
            "pigsty_token"
        );
    }

    updateAuthUI();
    updateAdminUI();
}


// =========================================================
// Auth UI
// =========================================================

function updateAuthUI() {

    if (!authArea) return;

    if (currentUser) {

        authArea.innerHTML = `

            <div class="user-menu">

                <span class="username">
                    ${escapeHtml(
                        currentUser.username
                    )}
                </span>

                <button
                    class="logout-btn"
                    id="logoutBtn"
                    type="button"
                >
                    로그아웃
                </button>

            </div>

        `;

        document
            .getElementById("logoutBtn")
            ?.addEventListener(
                "click",
                logout
            );

    } else {

        authArea.innerHTML = `

            <button
                class="login-btn"
                id="loginBtn"
                type="button"
            >
                로그인
            </button>

        `;

        document
            .getElementById("loginBtn")
            ?.addEventListener(
                "click",
                openLoginModal
            );
    }
}


// =========================================================
// Admin UI
// =========================================================

function updateAdminUI() {

    const button =
        document.getElementById(
            "deleteAllPostsBtn"
        );

    if (!button) return;

    if (
        currentUser &&
        Number(currentUser.is_admin) === 1
    ) {
        button.style.display = "block";
    } else {
        button.style.display = "none";
    }
}


// =========================================================
// Logout
// =========================================================

function logout() {

    token = null;
    currentUser = null;

    localStorage.removeItem(
        "pigsty_token"
    );

    updateAuthUI();
    updateAdminUI();

    loadPosts("latest");

    setHeaderActive(0);
}


// =========================================================
// Login
// =========================================================

async function login(
    username,
    password
) {

    const data = await apiFetch(
        "/api/auth/login",
        {
            method: "POST",

            body: JSON.stringify({
                username,
                password
            })
        }
    );

    token = data.access_token;

    localStorage.setItem(
        "pigsty_token",
        token
    );

    await loadUser();

    closeModal();

    await loadPosts("latest");

    setHeaderActive(0);

    alert("로그인 성공!");
}


// =========================================================
// Register
// =========================================================

async function register(
    username,
    password
) {

    await apiFetch(
        "/api/auth/register",
        {
            method: "POST",

            body: JSON.stringify({
                username,
                password
            })
        }
    );

    alert(
        "회원가입 성공! 이제 로그인하세요."
    );

    openLoginModal();
}


// =========================================================
// Posts - Load
// =========================================================

async function loadPosts(
    sort = "latest"
) {

    const postsContainer =
        document.getElementById(
            "posts"
        );

    if (!postsContainer) return;

    currentSort = sort;

    postsContainer.innerHTML = `

        <div class="empty-posts">

            <h3>
                게시물을 불러오는 중...
            </h3>

            <p>
                잠시만 기다려주세요.
            </p>

        </div>

    `;

    try {

        const posts =
            await apiFetch(
                "/api/posts"
            );

        if (!Array.isArray(posts)) {
            throw new Error(
                "게시물 데이터가 올바르지 않습니다."
            );
        }

        allPosts = posts;

        renderPosts(
            allPosts,
            sort
        );

    } catch (error) {

        console.error(
            "게시물 로드 오류:",
            error
        );

        postsContainer.innerHTML = `

            <div class="empty-posts">

                <h3>
                    게시물을 불러오지 못했습니다.
                </h3>

                <p>
                    ${escapeHtml(
                        error.message
                    )}
                </p>

            </div>

        `;
    }
}


// =========================================================
// Posts - Render
// =========================================================

function renderPosts(
    posts,
    sort = "latest"
) {

    const postsContainer =
        document.getElementById(
            "posts"
        );

    if (!postsContainer) return;

    currentSort = sort;

    const sortedPosts = [...posts];

    if (sort === "latest") {

        sortedPosts.sort(
            (a, b) =>
                new Date(
                    b.created_at
                ) -
                new Date(
                    a.created_at
                )
        );
    }

    if (sort === "popular") {

        sortedPosts.sort(
            (a, b) => {

                const likeDifference =
                    (b.likes || 0) -
                    (a.likes || 0);

                if (likeDifference !== 0) {
                    return likeDifference;
                }

                return (
                    new Date(
                        b.created_at
                    ) -
                    new Date(
                        a.created_at
                    )
                );
            }
        );
    }

    if (!sortedPosts.length) {

        postsContainer.innerHTML = `

            <div class="empty-posts">

                <h3>
                    게시물이 없습니다.
                </h3>

                <p>
                    게시물이 아직 없습니다.
                </p>

            </div>

        `;

        return;
    }

    postsContainer.innerHTML =
        sortedPosts
            .map(createPostHTML)
            .join("");

    attachPostEvents();
}


// =========================================================
// YouTube
// =========================================================

function getYouTubeId(url) {

    if (!url) return null;

    const patterns = [

        /youtube\.com\/watch\?v=([^&\s]+)/i,

        /youtu\.be\/([^?\s]+)/i,

        /youtube\.com\/shorts\/([^?\s]+)/i,

        /youtube\.com\/embed\/([^?\s]+)/i

    ];

    for (const pattern of patterns) {

        const match = url.match(pattern);

        if (match) {
            return match[1];
        }
    }

    return null;
}


function createYouTubePreview(
    content
) {

    if (!content) return "";

    const urlRegex =
        /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[^\s]+|youtu\.be\/[^\s]+|youtube\.com\/shorts\/[^\s]+)/i;

    const match =
        content.match(urlRegex);

    if (!match) return "";

    const videoId =
        getYouTubeId(match[0]);

    if (!videoId) return "";

    return `

        <div class="youtube-preview">

            <iframe
                src="https://www.youtube.com/embed/${encodeURIComponent(
                    videoId
                )}"
                title="YouTube video"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowfullscreen
                loading="lazy"
            ></iframe>

        </div>

    `;
}


// =========================================================
// Post HTML
// =========================================================

function createPostHTML(post) {

    const tags =
        post.tags
            ? post.tags
                .split(",")
                .map(tag => tag.trim())
                .filter(Boolean)
            : [];

    const youtubePreview =
        createYouTubePreview(
            post.content
        );

    const adminButtons =
        currentUser &&
        Number(currentUser.is_admin) === 1

            ? `

                <button
                    class="delete-btn"
                    data-id="${post.id}"
                    type="button"
                >
                    삭제
                </button>

            `

            : "";

    return `

        <article
            class="post-card"
            data-post-id="${post.id}"
        >

            <div class="post-top">

                <span class="post-author">
                    ${escapeHtml(
                        post.author
                    )}
                </span>

                <span class="post-date">
                    ${formatDate(
                        post.created_at
                    )}
                </span>

            </div>


            <h2 class="post-title">

                ${escapeHtml(
                    post.title
                )}

            </h2>


            <p class="post-content">

                ${escapeHtml(
                    post.content
                )}

            </p>


            ${youtubePreview}


            ${
                tags.length

                    ? `

                        <div class="post-tags">

                            ${
                                tags
                                    .map(
                                        tag =>
                                            `<span>
                                                #${escapeHtml(
                                                    tag
                                                )}
                                            </span>`
                                    )
                                    .join("")
                            }

                        </div>

                    `

                    : ""
            }


            <div class="post-actions">

                <button
                    class="like-btn"
                    data-id="${post.id}"
                    type="button"
                >
                    ♥ ${post.likes || 0}
                </button>

                ${adminButtons}

            </div>

        </article>

    `;
}


// =========================================================
// Post Events
// =========================================================

function attachPostEvents() {

    document
        .querySelectorAll(".like-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    if (!token) {

                        alert(
                            "로그인이 필요합니다."
                        );

                        openLoginModal();

                        return;
                    }

                    try {

                        const id =
                            button.dataset.id;

                        const result =
                            await apiFetch(
                                `/api/posts/${id}/like`,
                                {
                                    method: "POST"
                                }
                            );

                        button.textContent =
                            `♥ ${result.likes}`;

                        const post =
                            allPosts.find(
                                item =>
                                    String(
                                        item.id
                                    ) ===
                                    String(id)
                            );

                        if (post) {
                            post.likes =
                                result.likes;
                        }

                    } catch (error) {

                        alert(
                            error.message
                        );
                    }
                }
            );
        });


    document
        .querySelectorAll(".delete-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const id =
                        button.dataset.id;

                    if (
                        !confirm(
                            "이 게시글을 삭제하시겠습니까?"
                        )
                    ) {
                        return;
                    }

                    try {

                        await apiFetch(
                            `/api/posts/${id}`,
                            {
                                method: "DELETE"
                            }
                        );

                        await loadPosts(
                            getCurrentSort()
                        );

                    } catch (error) {

                        alert(
                            error.message
                        );
                    }
                }
            );
        });
}


// =========================================================
// Delete All Posts
// =========================================================

async function deleteAllPosts() {

    if (
        !currentUser ||
        Number(currentUser.is_admin) !== 1
    ) {

        alert(
            "관리자만 사용할 수 있습니다."
        );

        return;
    }

    if (
        !confirm(
            "정말 모든 게시물을 삭제하시겠습니까?"
        )
    ) {
        return;
    }

    if (
        !confirm(
            "⚠️ 모든 게시물이 영구적으로 삭제됩니다.\n\n계속하시겠습니까?"
        )
    ) {
        return;
    }

    try {

        await apiFetch(
            "/api/admin/posts",
            {
                method: "DELETE"
            }
        );

        alert(
            "모든 게시물이 삭제되었습니다."
        );

        await loadPosts("latest");

    } catch (error) {

        alert(
            error.message
        );
    }
}


// =========================================================
// Current Sort
// =========================================================

function getCurrentSort() {

    const select =
        document.getElementById(
            "sortSelect"
        );

    if (
        select &&
        select.value === "popular"
    ) {
        return "popular";
    }

    return currentSort || "latest";
}


// =========================================================
// Create Post
// =========================================================

async function createPost(
    title,
    content,
    tags
) {

    if (!token) {

        alert(
            "로그인이 필요합니다."
        );

        return;
    }

    await apiFetch(
        "/api/posts",
        {
            method: "POST",

            body: JSON.stringify({
                title,
                content,
                tags
            })
        }
    );

    closeModal();

    await loadPosts("latest");

    setHeaderActive(0);

    alert(
        "게시물이 등록되었습니다!"
    );
}


// =========================================================
// Modal
// =========================================================

function openModal(content) {

    let modal =
        document.getElementById(
            "modal"
        );

    if (!modal) {

        modal =
            document.createElement(
                "div"
            );

        modal.id = "modal";
        modal.className = "modal";

        document.body.appendChild(
            modal
        );
    }

    modal.innerHTML = content;

    modal.classList.add(
        "active"
    );

    modal
        .querySelector(".close")
        ?.addEventListener(
            "click",
            closeModal
        );

    modal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                modal
            ) {
                closeModal();
            }

        },
        {
            once: true
        }
    );
}


function closeModal() {

    const modal =
        document.getElementById(
            "modal"
        );

    if (modal) {

        modal.classList.remove(
            "active"
        );

        modal.innerHTML = "";
    }
}


// =========================================================
// Login Modal
// =========================================================

function openLoginModal() {

    openModal(`

        <div class="modal-box">

            <button
                class="close"
                type="button"
            >
                ×
            </button>


            <h2>
                로그인
            </h2>


            <form id="loginForm">

                <input
                    id="loginUsername"
                    type="text"
                    placeholder="아이디"
                    required
                >


                <input
                    id="loginPassword"
                    type="password"
                    placeholder="비밀번호"
                    required
                >


                <button
                    class="submit"
                    type="submit"
                >
                    로그인
                </button>

            </form>


            <button
                class="switch-auth"
                id="registerSwitch"
                type="button"
            >
                계정이 없나요? 회원가입
            </button>


            <p
                class="auth-message"
                id="authMessage"
            ></p>

        </div>

    `);


    document
        .getElementById("loginForm")
        ?.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                const username =
                    document
                        .getElementById(
                            "loginUsername"
                        )
                        .value;

                const password =
                    document
                        .getElementById(
                            "loginPassword"
                        )
                        .value;

                try {

                    await login(
                        username,
                        password
                    );

                } catch (error) {

                    document
                        .getElementById(
                            "authMessage"
                        )
                        .textContent =
                        error.message;
                }
            }
        );


    document
        .getElementById(
            "registerSwitch"
        )
        ?.addEventListener(
            "click",
            showRegisterForm
        );
}


// =========================================================
// Register Modal
// =========================================================

function showRegisterForm() {

    openModal(`

        <div class="modal-box">

            <button
                class="close"
                type="button"
            >
                ×
            </button>


            <h2>
                회원가입
            </h2>


            <form id="registerForm">

                <input
                    id="registerUsername"
                    type="text"
                    placeholder="아이디"
                    required
                >


                <input
                    id="registerPassword"
                    type="password"
                    placeholder="비밀번호"
                    required
                >


                <button
                    class="submit"
                    type="submit"
                >
                    회원가입
                </button>

            </form>


            <button
                class="switch-auth"
                id="loginSwitch"
                type="button"
            >
                이미 계정이 있나요? 로그인
            </button>


            <p
                class="auth-message"
                id="authMessage"
            ></p>

        </div>

    `);


    document
        .getElementById("registerForm")
        ?.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                const username =
                    document
                        .getElementById(
                            "registerUsername"
                        )
                        .value;

                const password =
                    document
                        .getElementById(
                            "registerPassword"
                        )
                        .value;

                try {

                    await register(
                        username,
                        password
                    );

                } catch (error) {

                    document
                        .getElementById(
                            "authMessage"
                        )
                        .textContent =
                        error.message;
                }
            }
        );


    document
        .getElementById(
            "loginSwitch"
        )
        ?.addEventListener(
            "click",
            openLoginModal
        );
}


// =========================================================
// Write Modal
// =========================================================

function openWriteModal() {

    if (!currentUser) {

        alert(
            "로그인이 필요합니다."
        );

        openLoginModal();

        return;
    }

    openModal(`

        <div class="modal-box">

            <button
                class="close"
                type="button"
            >
                ×
            </button>


            <h2>
                게시물 작성
            </h2>


            <form id="postForm">

                <input
                    id="postTitle"
                    type="text"
                    placeholder="제목"
                    required
                >


                <textarea
                    id="postContent"
                    placeholder="내용을 작성하세요.&#10;&#10;YouTube 링크를 넣으면 자동으로 미리보기가 표시됩니다."
                    required
                ></textarea>


                <input
                    id="postTags"
                    type="text"
                    placeholder="태그 (쉼표로 구분)"
                >


                <button
                    class="submit"
                    type="submit"
                >
                    게시하기
                </button>

            </form>

        </div>

    `);


    document
        .getElementById("postForm")
        ?.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                const title =
                    document
                        .getElementById(
                            "postTitle"
                        )
                        .value;

                const content =
                    document
                        .getElementById(
                            "postContent"
                        )
                        .value;

                const tags =
                    document
                        .getElementById(
                            "postTags"
                        )
                        .value;

                try {

                    await createPost(
                        title,
                        content,
                        tags
                    );

                } catch (error) {

                    alert(
                        error.message
                    );
                }
            }
        );
}


// =========================================================
// Helpers
// =========================================================

function formatDate(
    dateString
) {

    if (!dateString) return "";

    const date =
        new Date(
            dateString
        );

    return date.toLocaleString(
        "ko-KR",
        {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


function escapeHtml(value) {

    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );
}


// =========================================================
// Search
// =========================================================

function openSearch() {

    let searchBox =
        document.getElementById(
            "searchBox"
        );

    if (searchBox) {

        searchBox.classList.toggle(
            "active"
        );

        if (
            searchBox.classList.contains(
                "active"
            )
        ) {
            searchInput?.focus();
        }

        return;
    }

    searchBox =
        document.createElement(
            "div"
        );

    searchBox.id = "searchBox";
    searchBox.className = "search-box";

    searchBox.innerHTML = `

        <input
            id="searchInput"
            type="search"
            placeholder="게시물 검색..."
            autocomplete="off"
        >


        <button
            id="searchClose"
            type="button"
        >
            ×
        </button>

    `;

    document.body.appendChild(
        searchBox
    );

    searchInput =
        document.getElementById(
            "searchInput"
        );

    searchInput.addEventListener(
        "input",
        () => {

            filterPosts(
                searchInput.value
            );

        }
    );

    document
        .getElementById(
            "searchClose"
        )
        ?.addEventListener(
            "click",
            closeSearch
        );

    searchBox.classList.add(
        "active"
    );

    searchInput.focus();
}


function closeSearch() {

    const searchBox =
        document.getElementById(
            "searchBox"
        );

    if (!searchBox) return;

    searchBox.classList.remove(
        "active"
    );

    if (searchInput) {
        searchInput.value = "";
    }

    renderPosts(
        allPosts,
        currentSort
    );
}


function filterPosts(keyword) {

    const query =
        keyword
            .trim()
            .toLowerCase();

    if (!query) {

        renderPosts(
            allPosts,
            currentSort
        );

        return;
    }

    const filtered =
        allPosts.filter(post => {

            const title =
                String(
                    post.title || ""
                ).toLowerCase();

            const content =
                String(
                    post.content || ""
                ).toLowerCase();

            const author =
                String(
                    post.author || ""
                ).toLowerCase();

            const tags =
                String(
                    post.tags || ""
                ).toLowerCase();

            return (
                title.includes(query) ||
                content.includes(query) ||
                author.includes(query) ||
                tags.includes(query)
            );
        });

    renderPosts(
        filtered,
        currentSort
    );
}


// =========================================================
// Categories
// =========================================================

const PIGSTY_CATEGORIES = [
    "의상",
    "패션",
    "신발",
    "액세서리",
    "코스튬",
    "사진",
    "영상",
    "기타",
    "소품"
];


function setHeaderActive(
    activeIndex
) {

    document
        .querySelectorAll("nav a")
        .forEach(
            (link, index) => {

                link.classList.toggle(
                    "active",
                    index === activeIndex
                );

            }
        );
}


// =========================================================
// Category Page
// =========================================================

function openCategoryPage() {

    const postsContainer =
        document.getElementById(
            "posts"
        );

    if (!postsContainer) return;

    const sortSelect =
        document.getElementById(
            "sortSelect"
        );

    if (sortSelect) {

        sortSelect.value = "latest";

        sortSelect.disabled = true;
    }

    document
        .querySelectorAll(
            ".tabs button"
        )
        .forEach(
            button => {

                button.classList.remove(
                    "selected"
                );

            }
        );

    postsContainer.innerHTML = `

        <div class="category-page">

            <div class="category-page-header">

                <h2>
                    카테고리
                </h2>

                <p>
                    원하는 카테고리를 선택하세요.
                </p>

            </div>


            <div class="category-list">

                ${PIGSTY_CATEGORIES
                    .map(
                        category => `

                            <button
                                class="category-card"
                                type="button"
                                data-category="${escapeHtml(
                                    category
                                )}"
                            >
                                #${escapeHtml(
                                    category
                                )}
                            </button>

                        `
                    )
                    .join("")}

            </div>

        </div>

    `;


    document
        .querySelectorAll(
            ".category-card"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        showCategoryPosts(
                            button.dataset.category
                        );

                    }
                );

            }
        );
}


// =========================================================
// Category Posts
// =========================================================

function showCategoryPosts(
    category
) {

    const sortSelect =
        document.getElementById(
            "sortSelect"
        );

    if (sortSelect) {

        sortSelect.disabled = false;

        sortSelect.value = "latest";
    }


    const filtered =
        allPosts.filter(
            post => {

                const tags =
                    String(
                        post.tags || ""
                    )
                        .split(",")
                        .map(
                            tag =>
                                tag.trim()
                        )
                        .filter(Boolean);


                return tags.some(
                    tag =>
                        tag.toLowerCase() ===
                        category.toLowerCase()
                );

            }
        );


    const postsContainer =
        document.getElementById(
            "posts"
        );

    if (!postsContainer) return;


    const sorted =
        [...filtered].sort(
            (a, b) =>
                new Date(
                    b.created_at
                ) -
                new Date(
                    a.created_at
                )
        );


    postsContainer.innerHTML = `

        <div class="category-result-header">

            <button
                class="category-back-btn"
                id="categoryBackBtn"
                type="button"
            >
                ← 카테고리
            </button>


            <h2>
                #${escapeHtml(
                    category
                )}
            </h2>


            <p>
                ${sorted.length}개의 게시물
            </p>

        </div>


        <div class="posts category-posts">

            ${
                sorted.length

                    ? sorted
                        .map(
                            createPostHTML
                        )
                        .join("")

                    : `

                        <div class="empty-posts">

                            <h3>
                                게시물이 없습니다.
                            </h3>

                            <p>
                                이 카테고리에 등록된 게시물이 아직 없습니다.
                            </p>

                        </div>

                    `
            }

        </div>

    `;


    attachPostEvents();


    document
        .getElementById(
            "categoryBackBtn"
        )
        ?.addEventListener(
            "click",
            openCategoryPage
        );
}


// =========================================================
// Page Events
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        await loadUser();

        await loadPosts(
            "latest"
        );


        // =====================================================
        // 상단 메뉴
        // =====================================================

        const headerLinks =
            document.querySelectorAll(
                "nav a"
            );


        const headerHome =
            headerLinks[0];


        const headerPopular =
            headerLinks[1];


        const headerCategory =
            headerLinks[2];


        setHeaderActive(0);


        // =====================================================
        // 최신 / 인기 탭
        // =====================================================

        const tabs =
            document.querySelectorAll(
                ".tabs button"
            );


        tabs.forEach(
            (button, index) => {

                button.addEventListener(
                    "click",
                    async () => {

                        tabs.forEach(
                            btn => {

                                btn.classList.remove(
                                    "selected"
                                );

                            }
                        );


                        button.classList.add(
                            "selected"
                        );


                        const select =
                            document.getElementById(
                                "sortSelect"
                            );


                        if (select) {

                            select.disabled =
                                false;

                            select.value =
                                index === 0
                                    ? "latest"
                                    : "popular";

                        }


                        if (index === 0) {

                            await loadPosts(
                                "latest"
                            );

                        } else {

                            await loadPosts(
                                "popular"
                            );

                        }

                    }
                );

            }
        );


        // =====================================================
        // 상단 메뉴 - 홈
        // =====================================================

        headerHome?.addEventListener(
            "click",
            async event => {

                event.preventDefault();


                const sortSelect =
                    document.getElementById(
                        "sortSelect"
                    );


                if (sortSelect) {

                    sortSelect.disabled =
                        false;

                    sortSelect.value =
                        "latest";

                }


                await loadPosts(
                    "latest"
                );


                tabs.forEach(
                    btn => {

                        btn.classList.remove(
                            "selected"
                        );

                    }
                );


                tabs[0]?.classList.add(
                    "selected"
                );


                setHeaderActive(0);

            }
        );


        // =====================================================
        // 상단 메뉴 - 인기
        // =====================================================

        headerPopular?.addEventListener(
            "click",
            async event => {

                event.preventDefault();


                const sortSelect =
                    document.getElementById(
                        "sortSelect"
                    );


                if (sortSelect) {

                    sortSelect.disabled =
                        false;

                    sortSelect.value =
                        "popular";

                }


                await loadPosts(
                    "popular"
                );


                tabs.forEach(
                    btn => {

                        btn.classList.remove(
                            "selected"
                        );

                    }
                );


                tabs[1]?.classList.add(
                    "selected"
                );


                setHeaderActive(1);

            }
        );


        // =====================================================
        // 상단 메뉴 - 카테고리
        // =====================================================

        headerCategory?.addEventListener(
            "click",
            event => {

                event.preventDefault();


                setHeaderActive(2);


                openCategoryPage();

            }
        );


        // =====================================================
        // 정렬 Select
        // =====================================================

        const sortSelect =
            document.getElementById(
                "sortSelect"
            );


        sortSelect?.addEventListener(
            "change",
            async () => {

                const sort =
                    sortSelect.value;


                await loadPosts(
                    sort
                );


                tabs.forEach(
                    btn => {

                        btn.classList.remove(
                            "selected"
                        );

                    }
                );


                if (
                    sort === "popular"
                ) {

                    tabs[1]
                        ?.classList.add(
                            "selected"
                        );

                } else {

                    tabs[0]
                        ?.classList.add(
                            "selected"
                        );

                }


                setHeaderActive(
                    sort === "popular"
                        ? 1
                        : 0
                );

            }
        );


        // =====================================================
        // 글쓰기
        // =====================================================

        document
            .querySelector(
                ".write-btn"
            )
            ?.addEventListener(
                "click",
                openWriteModal
            );


        // =====================================================
        // 전체 게시물 삭제
        // =====================================================

        document
            .getElementById(
                "deleteAllPostsBtn"
            )
            ?.addEventListener(
                "click",
                deleteAllPosts
            );


        // =====================================================
        // 검색
        // =====================================================

        document
            .querySelector(
                ".search-btn"
            )
            ?.addEventListener(
                "click",
                openSearch
            );


        updateAdminUI();

    }
);