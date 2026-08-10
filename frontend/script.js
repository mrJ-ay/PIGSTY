function createPostHTML(post) {

    const tags = post.tags
        ? post.tags
            .split(",")
            .map(tag => tag.trim())
            .filter(Boolean)
        : [];


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

            ${
                post.author !== currentUser.username
                ? `
                    <button
                        class="ban-btn"
                        data-username="${escapeHtml(post.author)}"
                        type="button"
                    >
                        밴
                    </button>
                `
                : ""
            }
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
                    ${formatDate(post.created_at)}
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


    // =========================
    // 관리자 사용자 밴
    // =========================

    document
        .querySelectorAll(".ban-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const username =
                        button.dataset.username;


                    if (
                        !confirm(
                            `${username}님을 밴하시겠습니까?\n\n밴된 사용자는 로그인할 수 없습니다.`
                        )
                    ) {
                        return;
                    }


                    try {

                        await apiFetch(
                            `/api/admin/ban/${encodeURIComponent(username)}`,
                            {
                                method: "POST"
                            }
                        );


                        alert(
                            `${username}님을 밴했습니다.`
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