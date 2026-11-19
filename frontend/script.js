const API = "https://pigsty-backend.onrender.com";
const ONEID_API_URL = window.ONEID_API_URL || "http://127.0.0.1:8000";
const ONEID_CLIENT_ID = window.ONEID_CLIENT_ID || "pigsty";
const ONEID_VERIFIER_KEY = "pigsty_oneid_verifier";
const ONEID_STATE_KEY = "pigsty_oneid_state";
const ONEID_PENDING_KEY = "pigsty_oneid_pending";

let token = localStorage.getItem("pigsty_token");
let currentUser = null;
let allPosts = [];
let currentSort = "latest";
let searchInput = null;
let galleries = [];
let currentGallery = "all";
let conceptOnly = false;


// =========================================================
// DOM
// =========================================================

const authArea =
    document.getElementById("authArea");


// =========================================================
// 기본 카테고리
// =========================================================

const PIGSTY_CATEGORIES = [
    "의상",
    "패션",
    "신발",
    "액세서리",
    "사진",
    "영상",
    "기타",
    "소품"
];


// =========================================================
// API
// =========================================================

async function apiFetch(url, options = {}) {

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    const oneidAdminToken = sessionStorage.getItem("oneid_admin_access_token");
    if (oneidAdminToken) headers["X-ONEID-Authorization"] = `Bearer ${oneidAdminToken}`;

    if (token) {
        headers["Authorization"] =
            `Bearer ${token}`;
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
            data.detail ||
            `HTTP ${response.status}`
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

        currentUser =
            await apiFetch(
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


function updateAdminUI() {

    const isAdmin = Boolean(
        currentUser &&
        Number(currentUser.is_admin) === 1
    );

    const button =
        document.getElementById(
            "deleteAllPostsBtn"
        );

    if (button) {
        button.style.display = isAdmin ? "block" : "none";
    }

    const adminNavLink =
        document.getElementById(
            "adminNavLink"
        );

    if (adminNavLink) {
        adminNavLink.style.display = isAdmin ? "inline-block" : "none";
    }
}


function logout() {

    token = null;
    currentUser = null;

    localStorage.removeItem(
        "pigsty_token"
    );
    localStorage.removeItem("oneid_admin_access_token");

    sessionStorage.removeItem("oneid_admin_access_token");
    sessionStorage.removeItem(ONEID_PENDING_KEY);

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

    const data =
        await apiFetch(
            "/api/auth/login",
            {
                method: "POST",

                body: JSON.stringify({
                    username,
                    password
                })
            }
        );

    token =
        data.access_token;

    localStorage.setItem(
        "pigsty_token",
        token
    );

    await loadUser();

    closeModal();

    await loadPosts(
        "latest"
    );

    setHeaderActive(0);

    alert(
        "로그인 성공!"
    );
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

        const params = new URLSearchParams();
        if (currentGallery && currentGallery !== "all") {
            params.set("gallery", currentGallery);
        }
        if (conceptOnly) {
            params.set("concept", "1");
        }
        const qs = params.toString();
        const posts =
            await apiFetch(
                qs ? `/api/posts?${qs}` : "/api/posts"
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

    const sortedPosts =
        [...posts];

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

                const likes =
                    (b.likes || 0) -
                    (a.likes || 0);

                if (likes !== 0) {
                    return likes;
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

    for (
        const pattern
        of patterns
    ) {

        const match =
            url.match(pattern);

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
        content.match(
            urlRegex
        );

    if (!match) return "";

    const videoId =
        getYouTubeId(
            match[0]
        );

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

function createPostHTML(
    post
) {
    const adminButtons =
        currentUser &&
        Number(
            currentUser.is_admin
        ) === 1
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

    const commentBadge = (post.comment_count || 0) > 0
        ? `<span class="post-comment-count">[${post.comment_count}]</span>`
        : "";

    return `
        <article
            class="post-card post-list-row"
            data-post-id="${post.id}"
        >
            <div class="post-list-main">
                <span class="post-gallery-tag" data-gallery="${escapeHtml(post.gallery_slug || "free")}">[${escapeHtml(post.gallery_name || "자유")} 갤]</span>
                ${post.is_concept ? `<span class="post-concept-badge">★ 개념글</span>` : ""}
                <h2 class="post-title clickable" data-id="${post.id}">
                    ${escapeHtml(post.title)}
                </h2>
                ${commentBadge}
            </div>

            <div class="post-list-meta">
                <span class="post-author">
                    ${formatAuthorBadge(post.author, post.is_fixed, post.ip_prefix)}
                </span>
                <span class="post-date">
                    ${formatDate(post.created_at)}
                </span>
                <span class="post-meta-stats">조회 ${post.views || 0}</span>
                <button
                    class="like-btn compact"
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
        .querySelectorAll(".post-card[data-post-id]")
        .forEach(card => {
            card.addEventListener("click", event => {
                if (event.target.closest(".post-gallery-tag, .like-btn, .delete-btn")) {
                    return;
                }
                openPostDetailModal(Number(card.dataset.postId));
            });
        });

    document
        .querySelectorAll(".post-gallery-tag")
        .forEach(el => {
            el.addEventListener("click", event => {
                event.stopPropagation();
                selectGallery(el.dataset.gallery || "free");
            });
        });

    document
        .querySelectorAll(
            ".like-btn"
        )
        .forEach(
            button => {

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
                                        method:
                                            "POST"
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
            }
        );


    document
        .querySelectorAll(
            ".delete-btn"
        )
        .forEach(
            button => {

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
                                    method:
                                        "DELETE"
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
            }
        );
}


// =========================================================
// Delete All
// =========================================================

async function deleteAllPosts() {

    if (
        !currentUser ||
        Number(
            currentUser.is_admin
        ) !== 1
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
                method:
                    "DELETE"
            }
        );

        alert(
            "모든 게시물이 삭제되었습니다."
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


// =========================================================
// Sort
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
    tags,
    gallerySlug = "free",
    nickname = "",
    password = ""
) {

    const result = await apiFetch(
        "/api/posts",
        {
            method: "POST",

            body: JSON.stringify({
                title,
                content,
                tags,
                gallery_slug: gallerySlug,
                nickname: nickname || null,
                password: password || null
            })
        }
    );

    closeModal();

    await loadPosts(
        "latest"
    );
    loadGalleries();

    setHeaderActive(0);

    if (result && result.censored) {
        if (!result.dark_transferred) {
            try {
                await fetch(`${DARK_PIGSTY_URL}/api/posts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        title,
                        content,
                        tags,
                        gallery_slug: gallerySlug,
                        nickname: currentUser?.username || nickname || "ㅇㅇ",
                        password: password || null
                    })
                });
            } catch (_e) {}
        }
        showCensorAlert(result.censored_message || "🤖 [검열봇 알림] 금칙어가 감지되어 게시글이 다크 피그스티(PIGSTY // DARKNET)로 자동 이관되었습니다.");
    } else {
        alert(
            "게시물이 등록되었습니다!"
        );
    }
    loadCensorStats();
}



// =========================================================
// Modal
// =========================================================

function openModal(
    content
) {

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

    modal.innerHTML =
        content;

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

    if (!modal) return;

    modal.classList.remove(
        "active"
    );

    modal.innerHTML = "";
}


// =========================================================
// Login Modal
// =========================================================

function openLoginModal() {
    openModal(`
        <div class="modal-box">
            <button class="close" type="button">×</button>
            <h2>ONEID 로그인</h2>
            <p>ONEID 공통 계정으로 PIGSTY에 로그인합니다.</p>
            <button class="submit" type="button" onclick="beginOneIDLogin()">ONEID로 로그인</button>
            <section id="oneidMigrationPanel" hidden>
                <hr><h3>기존 PIGSTY 계정 연결</h3>
                <p>기존 게시글을 이어 쓰려면 예전 아이디와 비밀번호를 한 번 입력하세요.</p>
                <input id="legacyUsername" type="text" placeholder="기존 아이디" autocomplete="username">
                <input id="legacyPassword" type="password" placeholder="기존 비밀번호" autocomplete="current-password">
                <button class="submit" type="button" onclick="linkLegacyAccount()">기존 계정 연결</button>
                <button class="switch-auth" type="button" onclick="createOneIDSiteAccount()">새 PIGSTY 계정으로 시작</button>
            </section>
            <p class="auth-message" id="authMessage" role="status" aria-live="polite"></p>
        </div>
    `);
}

function base64Url(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function beginOneIDLogin() {
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
    const challenge = base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const redirectUri = `${location.origin}${location.pathname}`;
    sessionStorage.setItem(ONEID_VERIFIER_KEY, verifier);
    sessionStorage.setItem(ONEID_STATE_KEY, state);
    const query = new URLSearchParams({ client_id: ONEID_CLIENT_ID, redirect_uri: redirectUri, code_challenge: challenge, state });
    location.assign(`${ONEID_API_URL}/login.html?${query}`);
}

function showOneIDMigration(message) {
    const panel = document.getElementById("oneidMigrationPanel");
    if (panel) panel.hidden = false;
    const status = document.getElementById("authMessage");
    if (status) status.textContent = message || "기존 계정을 연결하거나 새 계정으로 시작할 수 있습니다.";
}

async function finishOneIDChoice(choice) {
    const oneidToken = sessionStorage.getItem(ONEID_PENDING_KEY);
    if (!oneidToken) return showOneIDMigration("ONEID 로그인이 만료됐습니다. 다시 로그인해 주세요.");
    const body = choice === "new" ? { create_new: true } : {
        legacy_username: document.getElementById("legacyUsername").value.trim(),
        legacy_password: document.getElementById("legacyPassword").value,
    };
    try {
        const response = await fetch(`${API}/api/auth/oneid/complete`, {
            method: "POST", headers: { Authorization: `Bearer ${oneidToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || "PIGSTY 계정을 연결하지 못했습니다.");
        token = result.access_token;
        localStorage.setItem("pigsty_token", token);
        sessionStorage.removeItem(ONEID_PENDING_KEY);
        sessionStorage.setItem("oneid_admin_access_token", oneidToken);
        await loadUser(); closeModal(); await loadPosts("latest");
    } catch (error) {
        const status = document.getElementById("authMessage");
        if (status) status.textContent = error.message;
    }
}

function linkLegacyAccount() { return finishOneIDChoice("legacy"); }
function createOneIDSiteAccount() { return finishOneIDChoice("new"); }

async function handleOneIDCallback() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    if (!code) return;
    const state = params.get("state");
    const expectedState = sessionStorage.getItem(ONEID_STATE_KEY);
    const verifier = sessionStorage.getItem(ONEID_VERIFIER_KEY);
    history.replaceState(null, "", `${location.pathname}${location.hash}`);
    sessionStorage.removeItem(ONEID_STATE_KEY); sessionStorage.removeItem(ONEID_VERIFIER_KEY);
    if (!state || state !== expectedState || !verifier) { openLoginModal(); return showOneIDMigration("로그인 연결을 확인하지 못했습니다. 다시 로그인해 주세요."); }
    const redirectUri = `${location.origin}${location.pathname}`;
    const response = await fetch(`${ONEID_API_URL}/api/oauth/token`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: ONEID_CLIENT_ID, redirect_uri: redirectUri, code, code_verifier: verifier }),
    });
    const session = await response.json();
    if (!response.ok || !session.access_token) { openLoginModal(); return showOneIDMigration(session.detail || "ONEID 로그인을 완료하지 못했습니다."); }
    sessionStorage.setItem(ONEID_PENDING_KEY, session.access_token);
    sessionStorage.setItem("oneid_admin_access_token", session.access_token);
    const complete = await fetch(`${API}/api/auth/oneid/complete`, {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: "{}",
    });
    const result = await complete.json();
    if (!complete.ok) {
        openLoginModal();
        if (result.detail === "ONEID_ACCOUNT_CHOICE_REQUIRED") return showOneIDMigration();
        return showOneIDMigration(result.detail || "PIGSTY 로그인을 완료하지 못했습니다.");
    }
    token = result.access_token; localStorage.setItem("pigsty_token", token); closeModal();
    sessionStorage.removeItem(ONEID_PENDING_KEY);
    await loadUser(); await loadPosts("latest");
}
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

    const defaultGallery = currentGallery && currentGallery !== "all" ? currentGallery : "free";
    const galleryOptions = (galleries.length ? galleries : [{ slug: "free", name: "자유", category: "메이저" }])
        .map(g => `<option value="${escapeHtml(g.slug)}" ${g.slug === defaultGallery ? "selected" : ""}>${escapeHtml(g.name)} 갤러리 (${escapeHtml(g.category || "메이저")})</option>`)
        .join("");

    const guestFields = currentUser ? "" : `
        <div class="guest-row">
            <input id="postNickname" type="text" placeholder="닉네임 (기본: ㅇㅇ)" maxlength="20">
            <input id="postPassword" type="password" placeholder="비밀번호 (삭제용, 선택)" maxlength="30">
        </div>
    `;

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

                <select id="postGallery" class="modal-select">
                    ${galleryOptions}
                </select>

                ${guestFields}

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
        .getElementById(
            "postForm"
        )
        ?.addEventListener(
            "submit",
            async event => {

                event.preventDefault();

                const gallerySlug =
                    document
                        .getElementById("postGallery")
                        ?.value || "free";

                const nickname =
                    document.getElementById("postNickname")?.value || "";

                const password =
                    document.getElementById("postPassword")?.value || "";

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
                        tags,
                        gallerySlug,
                        nickname,
                        password
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

    searchBox.id =
        "searchBox";

    searchBox.className =
        "search-box";

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


function filterPosts(
    keyword
) {

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
        allPosts.filter(
            post => {

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
            }
        );

    renderPosts(
        filtered,
        currentSort
    );
}


// =========================================================
// Header
// =========================================================

function setHeaderActive(
    activeIndex
) {

    document
        .querySelectorAll(
            "nav a"
        )
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
// 동적 카테고리
// =========================================================

function getCategories() {

    const categories =
        new Set(
            PIGSTY_CATEGORIES
        );

    /*
     * 최근 게시물 20개를 기준으로
     * tags에 들어있는 새로운 카테고리를 추가
     */

    const recentPosts =
        [...allPosts]
            .sort(
                (a, b) =>
                    new Date(
                        b.created_at
                    ) -
                    new Date(
                        a.created_at
                    )
            )
            .slice(0, 20);


    recentPosts.forEach(
        post => {

            String(
                post.tags || ""
            )
                .split(",")
                .map(
                    tag =>
                        tag.trim()
                )
                .filter(Boolean)
                .forEach(
                    tag => {

                        categories.add(
                            tag
                        );

                    }
                );

        }
    );


    return [
        ...categories
    ];
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

        sortSelect.disabled =
            true;

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


    const categories =
        getCategories();


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

                ${
                    categories
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
                        .join("")
                }

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


    const postsContainer =
        document.getElementById(
            "posts"
        );

    if (!postsContainer) return;


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
// DOM Loaded
// =========================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try { await handleOneIDCallback(); } catch (error) { openLoginModal(); showOneIDMigration(error?.message || "ONEID 연결 중 오류가 발생했습니다."); }
        await loadUser();

        await loadPosts(
            "latest"
        );


        // =====================================================
        // Header Links
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
        // 홈
        // =====================================================

        headerHome?.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                currentGallery = "all";
                conceptOnly = false;
                updateGalleryHeader();
                renderGalleryBar();

                await loadPosts(
                    "latest"
                );

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

                const tabs =
                    document.querySelectorAll(
                        ".tabs button"
                    );

                tabs.forEach(
                    button => {

                        button.classList.remove(
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
        // 인기
        // =====================================================

        headerPopular?.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                currentGallery = "all";
                conceptOnly = false;
                updateGalleryHeader();
                renderGalleryBar();

                await loadPosts(
                    "popular"
                );

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

                const tabs =
                    document.querySelectorAll(
                        ".tabs button"
                    );

                tabs.forEach(
                    button => {

                        button.classList.remove(
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
        // 카테고리
        // =====================================================

        headerCategory?.addEventListener(
            "click",
            event => {

                event.preventDefault();

                setHeaderActive(2);

                openGalleryDirectoryPage();

            }
        );

        document.getElementById("adminNavLink")?.addEventListener(
            "click",
            event => {

                event.preventDefault();

                const links = Array.from(document.querySelectorAll("nav a"));
                const idx = links.indexOf(event.currentTarget);
                if (idx >= 0) setHeaderActive(idx);

                openAdminPage();

            }
        );


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


                        const sort =
                            index === 0
                                ? "latest"
                                : "popular";


                        const sortSelect =
                            document.getElementById(
                                "sortSelect"
                            );

                        if (sortSelect) {

                            sortSelect.disabled =
                                false;

                            sortSelect.value =
                                sort;

                        }


                        await loadPosts(
                            sort
                        );


                        setHeaderActive(
                            index
                        );

                    }
                );

            }
        );


        // =====================================================
        // Select 정렬
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
                    button => {

                        button.classList.remove(
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

                    setHeaderActive(1);

                } else {

                    tabs[0]
                        ?.classList.add(
                            "selected"
                        );

                    setHeaderActive(0);

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


        // =====================================================
        // 전체 삭제
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


        document
            .getElementById("createGalleryBtn")
            ?.addEventListener("click", openCreateGalleryModal);

        document
            .getElementById("modeAllBtn")
            ?.addEventListener("click", () => setConceptMode(false));

        document
            .getElementById("modeConceptBtn")
            ?.addEventListener("click", () => setConceptMode(true));

        document
            .getElementById("feedConceptBtn")
            ?.addEventListener("click", () => setConceptMode(!conceptOnly));

        document
            .getElementById("feedGallerySelect")
            ?.addEventListener("change", event => {
                selectGallery(event.target.value || "all");
            });

        updateAdminUI();
        loadCensorStats();
        loadGalleries();

    }
);


// =========================================================
// Censor Bot UI & Handlers
// =========================================================

const DARK_PIGSTY_URL = "https://pigsty-dark.onrender.com";

function showCensorAlert(message) {
    const existing = document.getElementById("censorAlertOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "censorAlertOverlay";
    overlay.className = "censor-overlay";
    overlay.innerHTML = `
        <div class="censor-alert-card">
            <div class="censor-icon-wrap">
                <span class="censor-icon">🤖🚫</span>
            </div>
            <h3 class="censor-alert-title">피그스티 검열봇 감지 — 다크 피그스티로 강제 이송</h3>
            <p class="censor-alert-desc">${escapeHtml(message)}</p>
            <div class="censor-alert-notice">
                <span>※ 일반 피그스티에서 금칙어가 감지되어 격리 조치되었습니다.<br><strong id="censorRedirectCount">2</strong>초 후 무검열 제한구역 <strong>PIGSTY // DARKNET</strong>으로 자동 이동합니다...</span>
            </div>
            <button type="button" class="censor-close-btn" id="censorGoDarkNowBtn">지금 즉시 다크 피그스티로 이동 →</button>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("censorGoDarkNowBtn")?.addEventListener("click", () => {
        window.location.href = DARK_PIGSTY_URL;
    });

    let remaining = 2;
    const timer = setInterval(() => {
        remaining -= 1;
        const countEl = document.getElementById("censorRedirectCount");
        if (countEl && remaining > 0) {
            countEl.textContent = String(remaining);
        }
        if (remaining <= 0) {
            clearInterval(timer);
            window.location.href = DARK_PIGSTY_URL;
        }
    }, 1000);
}

async function loadCensorStats() {
    try {
        const badge = document.getElementById("censorBotBadge");
        if (badge) {
            badge.textContent = "작동 중";
        }
    } catch (err) {
        console.warn("Failed to update censor stats", err);
    }
}

// =========================================================
// DCInside-style Gallery & Post Detail / Comments
// =========================================================

async function loadGalleries() {
    try {
        const data = await apiFetch("/api/galleries");
        if (Array.isArray(data)) {
            galleries = data;
            renderGalleryBar();
            updateGalleryHeader();
        }
    } catch (err) {
        console.warn("Failed to load galleries", err);
    }
}

function renderGalleryBar() {
    const listEl = document.getElementById("galleryBarList");
    if (!listEl) return;

    const totalCount = galleries.reduce((sum, g) => sum + (g.post_count || 0), 0);
    const pills = [
        `<button class="gallery-pill ${currentGallery === "all" ? "active" : ""}" data-slug="all" type="button">
            <span>전체글</span>
            <span class="gallery-pill-count">${totalCount}</span>
        </button>`,
        ...galleries.map(g => `
            <button class="gallery-pill ${currentGallery === g.slug ? "active" : ""}" data-slug="${escapeHtml(g.slug)}" type="button">
                ${g.category === "마이너" ? `<span class="gallery-pill-minor">마이너</span>` : ""}
                <span>${escapeHtml(g.name)}</span>
                <span class="gallery-pill-count">${g.post_count || 0}</span>
            </button>
        `)
    ];

    listEl.innerHTML = pills.join("");
    listEl.querySelectorAll(".gallery-pill").forEach(btn => {
        btn.addEventListener("click", () => {
            selectGallery(btn.dataset.slug || "all");
        });
    });

    const selectEl = document.getElementById("feedGallerySelect");
    if (selectEl) {
        selectEl.innerHTML = [
            `<option value="all">전체 갤러리 (${totalCount})</option>`,
            ...galleries.map(g => `<option value="${escapeHtml(g.slug)}">${escapeHtml(g.name)} 갤 (${g.post_count || 0})</option>`)
        ].join("");
        selectEl.value = currentGallery || "all";
    }
}

function updateGalleryHeader() {
    const headerBar = document.getElementById("galleryHeaderBar");
    const titleEl = document.getElementById("currentGalleryTitle");
    const badgeEl = document.getElementById("currentGalleryBadge");
    const descEl = document.getElementById("currentGalleryDesc");
    if (!headerBar || !titleEl || !badgeEl || !descEl) return;

    if (currentGallery === "all") {
        headerBar.style.display = "none";
        return;
    }

    const g = galleries.find(item => item.slug === currentGallery);
    if (!g) {
        headerBar.style.display = "none";
        return;
    }
    headerBar.style.display = "block";
    titleEl.textContent = `${g.name} 갤러리`;
    badgeEl.textContent = g.category || "메이저";
    badgeEl.className = g.category === "마이너" ? "gallery-type-badge minor" : "gallery-type-badge";
    descEl.textContent = g.description || `${g.name} 주제로 이야기를 나누는 갤러리입니다.`;
}

async function selectGallery(slug) {
    currentGallery = slug || "all";
    setHeaderActive(currentGallery === "all" ? 0 : 2);
    renderGalleryBar();
    updateGalleryHeader();
    await loadPosts(currentSort);
}

async function setConceptMode(enabled) {
    conceptOnly = Boolean(enabled);
    document.getElementById("modeAllBtn")?.classList.toggle("active", !conceptOnly);
    document.getElementById("modeConceptBtn")?.classList.toggle("active", conceptOnly);
    document.getElementById("feedConceptBtn")?.classList.toggle("active", conceptOnly);
    await loadPosts(currentSort);
}

function formatAuthorBadge(author, isFixed, ipPrefix) {
    if (isFixed) {
        return `<strong>${escapeHtml(author)}</strong><span class="fixed-nick-badge" title="고정닉">✔</span>`;
    }
    const nick = escapeHtml(author || "ㅇㅇ");
    const ip = escapeHtml(ipPrefix || "127.0");
    return `<span>${nick}<span class="ip-prefix">(${ip})</span></span>`;
}

function openCreateGalleryModal() {
    openModal(`
        <div class="modal-box">
            <button class="close" type="button">×</button>
            <h2>마이너 갤러리 개설</h2>
            <form id="createGalleryForm">
                <input id="galleryNameInput" type="text" placeholder="갤러리 이름 (예: 고양이, 영화, 자취)" maxlength="30" required>
                <input id="gallerySlugInput" type="text" placeholder="영문 주소 슬러그 (선택, 예: cat)" maxlength="40">
                <textarea id="galleryDescInput" placeholder="갤러리 소개를 입력하세요." maxlength="200"></textarea>
                <button class="submit" type="submit">갤러리 개설하기</button>
            </form>
        </div>
    `);

    document.getElementById("createGalleryForm")?.addEventListener("submit", async event => {
        event.preventDefault();
        const name = document.getElementById("galleryNameInput")?.value || "";
        const slug = document.getElementById("gallerySlugInput")?.value || "";
        const description = document.getElementById("galleryDescInput")?.value || "";

        try {
            const created = await apiFetch("/api/galleries", {
                method: "POST",
                body: JSON.stringify({ name, slug: slug || null, description })
            });
            closeModal();
            await loadGalleries();
            await selectGallery(created.slug);
            alert(`${created.name} 갤러리가 개설되었습니다!`);
        } catch (err) {
            if (err.message && (err.message.includes("검열봇") || err.message.includes("부적절한 표현"))) {
                closeModal();
                showCensorAlert(err.message);
            } else {
                alert(err.message);
            }
        }
    });
}

async function openPostDetailModal(postId) {
    try {
        const post = await apiFetch(`/api/posts/${postId}`);
        const youtubePreview = createYouTubePreview(post.content);
        const commentsHtml = (post.comments || []).length
            ? post.comments.map(c => `
                <div class="comment-item">
                    <div class="comment-item-head">
                        <span>${formatAuthorBadge(c.author, c.is_fixed, c.ip_prefix)}</span>
                        <span>${formatDate(c.created_at)}</span>
                    </div>
                    <div class="comment-item-body">${escapeHtml(c.content)}</div>
                </div>
            `).join("")
            : `<p style="font-size:13px; color:#94a3b8; margin-bottom:10px;">아직 댓글이 없습니다. 첫 댓글을 남겨보세요!</p>`;

        const guestCommentFields = currentUser ? "" : `
            <div class="guest-row">
                <input id="detailCommentNick" type="text" placeholder="닉네임 (기본: ㅇㅇ)" maxlength="20">
                <input id="detailCommentPw" type="password" placeholder="비밀번호 (삭제용, 선택)" maxlength="30">
            </div>
        `;

        const canShowDelete =
            (currentUser && (Number(currentUser.is_admin) === 1 || (post.is_fixed && post.author === currentUser.username))) ||
            !post.is_fixed;

        openModal(`
            <div class="modal-box detail-modal-box">
                <button class="close" type="button">×</button>
                <div style="margin-bottom:8px;">
                    <span class="post-gallery-tag">[${escapeHtml(post.gallery_name || "자유")} 갤]</span>
                    ${post.is_concept ? `<span class="post-concept-badge">★ 개념글</span>` : ""}
                </div>
                <h2 style="margin-bottom:10px;">${escapeHtml(post.title)}</h2>
                <div class="detail-meta">
                    <span>${formatAuthorBadge(post.author, post.is_fixed, post.ip_prefix)}</span>
                    <span>·</span>
                    <span>${formatDate(post.created_at)}</span>
                    <span>·</span>
                    <span>조회 ${post.views || 0}</span>
                    <span>·</span>
                    <span>추천 <span id="detailLikesCount">${post.likes || 0}</span></span>
                </div>
                <div class="detail-content">${escapeHtml(post.content)}</div>
                ${youtubePreview}
                <div class="detail-actions">
                    <button id="detailLikeBtn" class="like-btn" type="button">♥ 추천 ${post.likes || 0}</button>
                    ${canShowDelete ? `<button id="detailDeleteBtn" class="detail-delete-btn" type="button">삭제</button>` : ""}
                </div>
                <div class="comments-section">
                    <h3>댓글 (${(post.comments || []).length})</h3>
                    <div id="detailCommentList" class="comment-list">${commentsHtml}</div>
                    <form id="detailCommentForm" class="comment-form-wrap">
                        ${guestCommentFields}
                        <div class="comment-form">
                            <input id="detailCommentInput" type="text" placeholder="댓글을 입력하세요..." maxlength="1000" required>
                            <button type="submit">등록</button>
                        </div>
                    </form>
                </div>
            </div>
        `);

        document.getElementById("detailLikeBtn")?.addEventListener("click", async () => {
            try {
                const res = await apiFetch(`/api/posts/${postId}/like`, { method: "POST" });
                const btn = document.getElementById("detailLikeBtn");
                const cnt = document.getElementById("detailLikesCount");
                if (btn) btn.textContent = `♥ 추천 ${res.likes}`;
                if (cnt) cnt.textContent = res.likes;
                loadPosts(currentSort);
            } catch (err) {
                alert(err.message);
            }
        });

        document.getElementById("detailDeleteBtn")?.addEventListener("click", async () => {
            let pw = "";
            if (!post.is_fixed && !(currentUser && Number(currentUser.is_admin) === 1)) {
                pw = prompt("글 작성 시 입력한 비밀번호를 입력하세요:") || "";
                if (!pw) return;
            } else if (!confirm("이 게시글을 삭제하시겠습니까?")) {
                return;
            }
            try {
                await apiFetch(`/api/posts/${postId}/delete`, {
                    method: "POST",
                    body: JSON.stringify({ password: pw || null })
                });
                closeModal();
                await loadPosts(currentSort);
                loadGalleries();
                alert("게시글이 삭제되었습니다.");
            } catch (err) {
                alert(err.message);
            }
        });

        document.getElementById("detailCommentForm")?.addEventListener("submit", async event => {
            event.preventDefault();
            const input = document.getElementById("detailCommentInput");
            const content = input?.value?.trim() || "";
            if (!content) return;
            const nickname = document.getElementById("detailCommentNick")?.value || "";
            const password = document.getElementById("detailCommentPw")?.value || "";
            try {
                await apiFetch(`/api/posts/${postId}/comments`, {
                    method: "POST",
                    body: JSON.stringify({
                        content,
                        nickname: nickname || null,
                        password: password || null
                    })
                });
                await openPostDetailModal(postId);
                loadPosts(currentSort);
            } catch (err) {
                if (err.message && (err.message.includes("검열봇") || err.message.includes("부적절한 표현"))) {
                    closeModal();
                    showCensorAlert(err.message);
                } else {
                    alert(err.message);
                }
            }
        });

        loadPosts(currentSort);
    } catch (err) {
        alert(err.message || "게시물을 불러오지 못했습니다.");
    }
}

async function openGalleryDirectoryPage() {
    const postsContainer = document.getElementById("posts");
    if (!postsContainer) return;

    const headerBar = document.getElementById("galleryHeaderBar");
    if (headerBar) headerBar.style.display = "none";

    const sortSelect = document.getElementById("sortSelect");
    if (sortSelect) sortSelect.disabled = true;

    if (!galleries.length) {
        await loadGalleries();
    }

    const majorList = galleries.filter(g => (g.category || "메이저") !== "마이너");
    const minorList = galleries.filter(g => g.category === "마이너");

    const renderCards = list => list.map(g => `
        <div class="gallery-dir-card" data-slug="${escapeHtml(g.slug)}">
            <div class="gallery-dir-top">
                <strong>${escapeHtml(g.name)} 갤러리</strong>
                <span class="gallery-type-badge ${g.category === "마이너" ? "minor" : ""}">${escapeHtml(g.category || "메이저")}</span>
            </div>
            <p class="gallery-dir-desc">${escapeHtml(g.description || "")}</p>
            <div class="gallery-dir-meta">
                <span>글 ${g.post_count || 0}</span>
                <span>·</span>
                <span>개념글 ${g.concept_count || 0}</span>
            </div>
        </div>
    `).join("");

    postsContainer.innerHTML = `
        <div class="gallery-directory-wrap">
            <div class="gallery-dir-section">
                <div class="gallery-dir-header">
                    <h3>메이저 갤러리</h3>
                </div>
                <div class="gallery-directory-grid">
                    ${renderCards(majorList)}
                </div>
            </div>
            <div class="gallery-dir-section">
                <div class="gallery-dir-header">
                    <h3>마이너 갤러리</h3>
                    <button id="dirCreateGalleryBtn" class="create-gallery-btn" type="button">+ 마이너 갤러리 개설</button>
                </div>
                <div class="gallery-directory-grid">
                    ${minorList.length ? renderCards(minorList) : `<p style="color:#6b7280; font-size:13px;">아직 개설된 마이너 갤러리가 없습니다. 첫 번째 마이너 갤러리를 개설해보세요!</p>`}
                </div>
            </div>
        </div>
    `;

    postsContainer.querySelectorAll(".gallery-dir-card").forEach(card => {
        card.addEventListener("click", async () => {
            if (sortSelect) sortSelect.disabled = false;
            await selectGallery(card.dataset.slug || "all");
        });
    });

    document.getElementById("dirCreateGalleryBtn")?.addEventListener("click", openCreateGalleryModal);
}



// =========================================================
// Admin Management Page
// =========================================================

let adminOverviewCache = null;

async function openAdminPage() {
    if (!currentUser || Number(currentUser.is_admin) !== 1) {
        alert("관리자만 접근할 수 있습니다.");
        return;
    }

    const postsContainer = document.getElementById("posts");
    if (!postsContainer) return;

    const headerBar = document.getElementById("galleryHeaderBar");
    if (headerBar) headerBar.style.display = "none";

    const sortSelect = document.getElementById("sortSelect");
    if (sortSelect) sortSelect.disabled = true;

    postsContainer.innerHTML = `
        <div class="empty-posts">
            <h3>관리자 콘솔 불러오는 중...</h3>
            <p>잠시만 기다려주세요.</p>
        </div>
    `;

    try {
        const data = await apiFetch("/api/admin/overview");
        adminOverviewCache = data;
        renderAdminPage(data);
    } catch (error) {
        postsContainer.innerHTML = `
            <div class="empty-posts">
                <h3>관리자 콘솔 로드 실패</h3>
                <p>${escapeHtml(error.message || "권한 또는 서버 상태를 확인해 주세요.")}</p>
            </div>
        `;
    }
}

function renderAdminPage(data, searchQuery = "") {
    const postsContainer = document.getElementById("posts");
    if (!postsContainer) return;

    const stats = data.stats || {};
    const galleryList = data.galleries || [];
    const postList = data.posts || [];
    const q = (searchQuery || "").trim().toLowerCase();

    const filteredPosts = q
        ? postList.filter(p =>
            (p.title || "").toLowerCase().includes(q) ||
            (p.author || "").toLowerCase().includes(q) ||
            (p.gallery_name || "").toLowerCase().includes(q) ||
            (p.gallery_slug || "").toLowerCase().includes(q)
        )
        : postList;

    const galleriesHtml = galleryList.map(g => `
        <div class="admin-row-item">
            <div class="admin-row-info">
                <div class="admin-row-title">
                    ${escapeHtml(g.name)} 갤러리
                    <span style="color:#6b7280; font-weight:500;">(${escapeHtml(g.slug)})</span>
                    ${g.protected ? `<span class="admin-badge protected">기본 보호</span>` : ""}
                </div>
                <div class="admin-row-meta">
                    <span>분류: ${escapeHtml(g.category || "메이저")}</span>
                    <span>·</span>
                    <span>개설자: ${escapeHtml(g.creator || "system")}</span>
                    <span>·</span>
                    <span>게시물 ${g.post_count || 0}개</span>
                </div>
            </div>
            <div class="admin-row-actions">
                <button class="admin-btn small" type="button" data-admin-open-gallery="${escapeHtml(g.slug)}">이동</button>
                ${g.protected
                    ? ""
                    : `<button class="admin-btn small danger" type="button" data-admin-del-gallery="${escapeHtml(g.slug)}" data-admin-gallery-name="${escapeHtml(g.name)}">갤러리 삭제</button>`}
            </div>
        </div>
    `).join("");

    const postsHtml = filteredPosts.length
        ? filteredPosts.map(p => `
            <div class="admin-row-item">
                <div class="admin-row-info">
                    <div class="admin-row-title">
                        [${escapeHtml(p.gallery_name || p.gallery_slug || "자유")}] ${escapeHtml(p.title)}
                    </div>
                    <div class="admin-row-meta">
                        <span class="admin-badge ${p.status === "censored" ? "censored" : "active"}">
                            ${p.status === "censored" ? "격리됨" : "정상"}
                        </span>
                        <span>#${p.id}</span>
                        <span>·</span>
                        <span>${escapeHtml(p.author || "익명")}</span>
                        <span>·</span>
                        <span>${formatDate(p.created_at)}</span>
                        <span>·</span>
                        <span>조회 ${p.views || 0} / 추천 ${p.likes || 0}</span>
                        ${p.censored_reason ? `<span>· 사유: ${escapeHtml(p.censored_reason)}</span>` : ""}
                    </div>
                </div>
                <div class="admin-row-actions">
                    <button class="admin-btn small" type="button" data-admin-view-post="${p.id}">보기</button>
                    <button class="admin-btn small danger" type="button" data-admin-del-post="${p.id}">삭제</button>
                </div>
            </div>
        `).join("")
        : `<p style="color:#6b7280; font-size:13px; margin:8px 0;">표시할 게시물이 없습니다.</p>`;

    postsContainer.innerHTML = `
        <div class="admin-page-wrap">
            <div class="admin-page-header">
                <div>
                    <h2>PIGSTY 관리자 콘솔</h2>
                    <p>관리자 계정: <strong>${escapeHtml(data.admin || currentUser?.username || "admin")}</strong> · 게시물/갤러리 삭제 및 서버 리부트를 한 곳에서 관리합니다.</p>
                </div>
                <button id="adminRefreshBtn" class="admin-btn" type="button">새로고침</button>
            </div>

            <div class="admin-stat-grid">
                <div class="admin-stat-card">
                    <span class="admin-stat-label">전체 게시물</span>
                    <span class="admin-stat-val">${stats.total_posts ?? 0}</span>
                </div>
                <div class="admin-stat-card">
                    <span class="admin-stat-label">정상 게시물</span>
                    <span class="admin-stat-val">${stats.active_posts ?? 0}</span>
                </div>
                <div class="admin-stat-card">
                    <span class="admin-stat-label">검열 격리</span>
                    <span class="admin-stat-val">${stats.censored_posts ?? 0}</span>
                </div>
                <div class="admin-stat-card">
                    <span class="admin-stat-label">전체 갤러리</span>
                    <span class="admin-stat-val">${stats.total_galleries ?? 0}</span>
                </div>
            </div>

            <div class="admin-section-card">
                <div class="admin-section-head">
                    <h3>시스템 제어 (전체 삭제 · 리부트)</h3>
                </div>
                <div class="admin-action-row">
                    <button id="adminSoftRebootBtn" class="admin-btn warn" type="button">소프트 리부트 (갤러리·검열봇 재동기화)</button>
                    <button id="adminHardRebootBtn" class="admin-btn danger" type="button">서버 리부트 (백엔드 재시작)</button>
                    <button id="adminDeleteAllBtn" class="admin-btn danger" type="button">전체 게시물 삭제</button>
                </div>
            </div>

            <div class="admin-section-card">
                <div class="admin-section-head">
                    <h3>갤러리 관리 (${galleryList.length})</h3>
                </div>
                <div class="admin-table-list">
                    ${galleriesHtml}
                </div>
            </div>

            <div class="admin-section-card">
                <div class="admin-section-head">
                    <h3>게시물 관리 (최근 ${postList.length}건)</h3>
                    <input id="adminPostSearch" class="admin-search-input" type="search" placeholder="제목 / 작성자 / 갤러리 검색" value="${escapeHtml(searchQuery)}">
                </div>
                <div id="adminPostList" class="admin-table-list">
                    ${postsHtml}
                </div>
            </div>
        </div>
    `;

    document.getElementById("adminRefreshBtn")?.addEventListener("click", openAdminPage);

    document.getElementById("adminSoftRebootBtn")?.addEventListener("click", async () => {
        if (!confirm("기본 갤러리 복구 및 전체 게시물 소급 검열을 다시 실행할까요?")) return;
        try {
            const res = await apiFetch("/api/admin/reboot", {
                method: "POST",
                body: JSON.stringify({ mode: "soft" })
            });
            alert(res.message || "소프트 리부트 완료");
            await loadGalleries();
            await loadCensorStats();
            await openAdminPage();
        } catch (err) {
            alert(err.message);
        }
    });

    document.getElementById("adminHardRebootBtn")?.addEventListener("click", async () => {
        if (!confirm("백엔드 서버 프로세스를 재시작(리부트)합니다.\n잠시 5초 정도 접속이 끊길 수 있습니다. 계속할까요?")) return;
        try {
            const res = await apiFetch("/api/admin/reboot", {
                method: "POST",
                body: JSON.stringify({ mode: "hard" })
            });
            alert(res.message || "서버 리부트를 요청했습니다. 5초 후 새로고침됩니다.");
            setTimeout(() => location.reload(), 5000);
        } catch (err) {
            alert(err.message);
        }
    });

    document.getElementById("adminDeleteAllBtn")?.addEventListener("click", async () => {
        if (!confirm("정말 모든 게시물을 삭제하시겠습니까?")) return;
        if (!confirm("⚠️ 모든 게시물이 영구적으로 삭제됩니다. 계속하시겠습니까?")) return;
        try {
            const res = await apiFetch("/api/admin/posts", { method: "DELETE" });
            alert(`${res.deleted_count ?? 0}개의 게시물이 모두 삭제되었습니다.`);
            await loadGalleries();
            await loadCensorStats();
            await openAdminPage();
        } catch (err) {
            alert(err.message);
        }
    });

    document.getElementById("adminPostSearch")?.addEventListener("input", event => {
        const val = event.target.value || "";
        const cursor = event.target.selectionStart;
        renderAdminPage(adminOverviewCache, val);
        const nextInput = document.getElementById("adminPostSearch");
        if (nextInput) {
            nextInput.focus();
            if (typeof cursor === "number") nextInput.setSelectionRange(cursor, cursor);
        }
    });

    postsContainer.querySelectorAll("[data-admin-open-gallery]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const sortSel = document.getElementById("sortSelect");
            if (sortSel) sortSel.disabled = false;
            await selectGallery(btn.dataset.adminOpenGallery || "all");
        });
    });

    postsContainer.querySelectorAll("[data-admin-del-gallery]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const slug = btn.dataset.adminDelGallery;
            const name = btn.dataset.adminGalleryName || slug;
            if (!slug) return;
            if (!confirm(`'${name}' 갤러리(${slug})와 해당 갤러리의 모든 게시물을 삭제하시겠습니까?`)) return;
            try {
                const res = await apiFetch(`/api/admin/galleries/${encodeURIComponent(slug)}?delete_posts=true`, {
                    method: "DELETE"
                });
                alert(res.message || "갤러리가 삭제되었습니다.");
                await loadGalleries();
                await openAdminPage();
            } catch (err) {
                alert(err.message);
            }
        });
    });

    postsContainer.querySelectorAll("[data-admin-view-post]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = Number(btn.dataset.adminViewPost);
            if (id) await openPostDetailModal(id);
        });
    });

    postsContainer.querySelectorAll("[data-admin-del-post]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = Number(btn.dataset.adminDelPost);
            if (!id) return;
            if (!confirm(`게시물 #${id} 을(를) 삭제하시겠습니까?`)) return;
            try {
                await apiFetch(`/api/admin/posts/${id}`, { method: "DELETE" });
                await loadGalleries();
                await loadCensorStats();
                await openAdminPage();
            } catch (err) {
                alert(err.message);
            }
        });
    });
}