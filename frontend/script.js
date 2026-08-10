const API = "https://pigsty-backend.onrender.com";

let token = localStorage.getItem("pigsty_token");
let currentUser = null;

// =========================
// DOM
// =========================

const authArea = document.getElementById("authArea");
const loginBtn = document.getElementById("loginBtn");

// =========================
// API
// =========================

async function apiFetch(url, options = {}) {

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(
        API + url,
        {
            ...options,
            headers
        }
    );

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
}


function updateAuthUI() {

    if (!authArea) return;

    if (currentUser) {

        authArea.innerHTML = `
            <div class="user-menu">

                <span class="username">
                    ${escapeHtml(currentUser.username)}
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


function logout() {

    token = null;

    currentUser = null;

    localStorage.removeItem(
        "pigsty_token"
    );

    updateAuthUI();

    loadPosts("latest");
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
// Posts
// =========================================================

async function loadPosts(
    sort = "latest"
) {

    const postsContainer =
        document.getElementById(
            "posts"
        );

    if (!postsContainer) return;

    try {

        const posts = await apiFetch(
            "/api/posts"
        );


        // =========================
        // Empty
        // =========================

        if (!posts.length) {

            postsContainer.innerHTML = `
                <div class="empty-posts">

                    <h3>
                        아직 게시물이 없습니다.
                    </h3>

                    <p>
                        첫 번째 게시물을 올려보세요.
                    </p>

                </div>
            `;

            return;
        }


        // =========================
        // 최신순
        // =========================

        if (sort === "latest") {

            posts.sort(
                (a, b) => {

                    return (
                        new Date(b.created_at) -
                        new Date(a.created_at)
                    );

                }
            );
        }


        // =========================
        // 인기순
        // =========================

        if (sort === "popular") {

            posts.sort(
                (a, b) => {

                    const likeDifference =
                        (b.likes || 0) -
                        (a.likes || 0);


                    if (
                        likeDifference !== 0
                    ) {

                        return likeDifference;
                    }


                    return (
                        new Date(b.created_at) -
                        new Date(a.created_at)
                    );

                }
            );
        }


        // =========================
        // Render
        // =========================

        postsContainer.innerHTML =
            posts
                .map(createPostHTML)
                .join("");


        attachPostEvents();

    } catch (error) {

        postsContainer.innerHTML = `
            <div class="empty-posts">

                <h3>
                    게시물을 불러오지 못했습니다.
                </h3>

                <p>
                    ${escapeHtml(error.message)}
                </p>

            </div>
        `;
    }
}


// =========================================================
// Create Post HTML
// =========================================================

function createPostHTML(post) {

    const tags = post.tags
        ? post.tags
            .split(",")
            .map(tag => tag.trim())
            .filter(Boolean)
        : [];


    // =========================
    // 관리자 삭제 버튼
    // =========================

    const adminButtons =
        currentUser &&
        currentUser.is_admin === 1
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
                    ${escapeHtml(post.author)}
                </span>

                <span class="post-date">
                    ${formatDate(
                        post.created_at
                    )}
                </span>

            </div>


            <h2 class="post-title">
                ${escapeHtml(post.title)}
            </h2>


            <p class="post-content">
                ${escapeHtml(post.content)}
            </p>


            ${
                tags.length
                ? `
                    <div class="post-tags">

                        ${
                            tags
                                .map(
                                    tag =>
                                    `<span>
                                        #${escapeHtml(tag)}
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


    // =========================
    // 좋아요
    // =========================

    document
        .querySelectorAll(".like-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

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


                    } catch (error) {

                        alert(
                            error.message
                        );
                    }
                }
            );
        });


    // =========================
    // 관리자 게시글 삭제
    // =========================

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
                            "latest"
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


    await loadPosts(
        "latest"
    );


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
                event.target === modal
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
        .getElementById(
            "registerForm"
        )
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
                    placeholder="내용을 작성하세요."
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
        .getElementById(
            "postForm"
        )
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
        new Date(dateString);


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


function escapeHtml(
    value
) {

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
// Page Events
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        await loadUser();

        await loadPosts(
            "latest"
        );


        // =========================
        // 최신 / 인기 탭
        // =========================

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


        // =========================
        // 정렬 Select
        // =========================

        const sortSelect =
            document.querySelector(
                ".feed-header select"
            );


        sortSelect?.addEventListener(
            "change",
            async () => {

                if (
                    sortSelect.value ===
                    "인기순"
                ) {

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


                    tabs[1]
                        ?.classList.add(
                            "selected"
                        );

                } else {

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


                    tabs[0]
                        ?.classList.add(
                            "selected"
                        );
                }

            }
        );


        // =========================
        // 글쓰기
        // =========================

        document
            .querySelector(
                ".write-btn"
            )
            ?.addEventListener(
                "click",
                openWriteModal
            );

    }
);