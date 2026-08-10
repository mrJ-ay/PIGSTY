const API = "https://pigsty-backend.onrender.com";

let token = localStorage.getItem("pigsty_token");
let currentUser = null;

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

    const authArea =
        document.getElementById(
            "authArea"
        );

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

        if (
            !Array.isArray(posts) ||
            posts.length === 0
        ) {

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

        // 최신순
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

        // 인기순
        if (sort === "popular") {

            posts.sort(
                (a, b) => {

                    const likes =
                        (b.likes || 0) -
                        (a.likes || 0);

                    if (likes !== 0) {
                        return likes;
                    }

                    return (
                        new Date(b.created_at) -
                        new Date(a.created_at)
                    );
                }
            );
        }

        postsContainer.innerHTML =
            posts
                .map(createPostHTML)
                .join("");

        attachPostEvents();

    } catch (error) {

        console.error(
            "게시물 불러오기 오류:",
            error
        );

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
// YouTube URL
// =========================================================

function getYouTubeId(url) {

    try {

        const parsed =
            new URL(url);

        // youtube.com/watch?v=
        if (
            parsed.hostname.includes(
                "youtube.com"
            )
        ) {

            const id =
                parsed.searchParams.get(
                    "v"
                );

            if (id) {
                return id;
            }
        }

        // youtu.be/ID
        if (
            parsed.hostname ===
            "youtu.be"
        ) {

            return parsed.pathname
                .slice(1)
                .split("/")[0];
        }

        // youtube.com/shorts/ID
        if (
            parsed.hostname.includes(
                "youtube.com"
            ) &&
            parsed.pathname.startsWith(
                "/shorts/"
            )
        ) {

            return parsed.pathname
                .split("/")[2];
        }

        // youtube.com/embed/ID
        if (
            parsed.hostname.includes(
                "youtube.com"
            ) &&
            parsed.pathname.startsWith(
                "/embed/"
            )
        ) {

            return parsed.pathname
                .split("/")[2];
        }

    } catch {
        return null;
    }

    return null;
}

// =========================================================
// Link Preview
// =========================================================

function createLinkPreview(url) {

    const youtubeId =
        getYouTubeId(url);

    // =====================================================
    // YouTube
    // =====================================================

    if (youtubeId) {

        const safeId =
            escapeHtml(youtubeId);

        return `
            <div class="link-preview youtube-preview">

                <div class="youtube-wrapper">

                    <iframe
                        src="https://www.youtube.com/embed/${safeId}"
                        title="YouTube video"
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowfullscreen
                    ></iframe>

                </div>

                <a
                    class="preview-link"
                    href="${escapeHtml(url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    YouTube에서 보기
                </a>

            </div>
        `;
    }

    // =====================================================
    // 일반 링크
    // =====================================================

    return `
        <div class="link-preview">

            <a
                href="${escapeHtml(url)}"
                target="_blank"
                rel="noopener noreferrer"
                class="preview-link"
            >
                🔗 ${escapeHtml(url)}
            </a>

        </div>
    `;
}

// =========================================================
// Content Preview
// =========================================================

function createContentHTML(content) {

    const escaped =
        escapeHtml(content);

    const urlRegex =
        /(https?:\/\/[^\s<]+)/g;

    let html = escaped.replace(
        urlRegex,
        match => {

            // 끝에 붙은 문장부호 제거
            let url = match;

            let ending = "";

            while (
                /[.,!?;:)\]}]$/.test(url)
            ) {

                ending =
                    url.slice(-1) +
                    ending;

                url =
                    url.slice(0, -1);
            }

            return `
                <a
                    href="${escapeHtml(url)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="content-link"
                >
                    ${escapeHtml(url)}
                </a>${ending}
            `;
        }
    );

    const urls = content.match(
        /https?:\/\/[^\s<]+/g
    ) || [];

    const previews = [];

    const seen = new Set();

    urls.forEach(rawUrl => {

        let url = rawUrl;

        while (
            /[.,!?;:)\]}]$/.test(url)
        ) {
            url = url.slice(0, -1);
        }

        if (seen.has(url)) {
            return;
        }

        seen.add(url);

        previews.push(
            createLinkPreview(url)
        );
    });

    return `
        <div class="post-text">
            ${html}
        </div>

        ${
            previews.length
            ? `
                <div class="post-previews">
                    ${previews.join("")}
                </div>
            `
            : ""
        }
    `;
}

// =========================================================
// Create Post HTML
// =========================================================

function createPostHTML(post) {

    const tags = post.tags
        ? post.tags
            .split(",")
            .map(
                tag => tag.trim()
            )
            .filter(Boolean)
        : [];

    // 관리자 삭제 버튼
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


            <div class="post-content">
                ${createContentHTML(
                    post.content
                )}
            </div>


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

    // =====================================================
    // 좋아요
    // =====================================================

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


    // =====================================================
    // 관리자 게시글 삭제
    // =====================================================

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
                    placeholder="내용을 작성하세요.&#10;&#10;YouTube 링크를 넣으면 미리보기가 표시됩니다."
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

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "";
    }

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

        // 로그인 상태
        await loadUser();

        // 게시물
        await loadPosts(
            "latest"
        );


        // =====================================================
        // 최신 / 인기
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
        // 정렬 Select
        // =====================================================

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

    }
);