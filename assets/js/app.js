import { auth, db, authReady } from "./firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    where,
    serverTimestamp,
    doc,
    setDoc,
    deleteDoc,
    updateDoc,
    writeBatch,
    getDocs
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
/* =====================================
   OUR LITTLE SPACE
   Application logic
===================================== */

document.addEventListener("DOMContentLoaded", () => {

    const html = document.documentElement;
    // =================================
    // FIREBASE AUTHENTICATION ELEMENTS
    // =================================

    const authScreen = document.getElementById("authScreen");

    document.querySelectorAll(".sign-out-button").forEach(button => {
        button.addEventListener("click", async () => {
            try {
                await setOffline();
                await signOut(auth);
            } catch (error) {
                console.error("Sign-out error:", error);
                alert("Unable to sign out. Please try again.");
            }
        });
    });
    const authForm = document.getElementById("authForm");
    const authEmail = document.getElementById("authEmail");
    const authPassword = document.getElementById("authPassword");
    const authError = document.getElementById("authError");
    const authSubmit = document.getElementById("authSubmit");
    const authTitle = document.getElementById("authTitle");
    const authSubtitle = document.getElementById("authSubtitle");
    const authModeToggle = document.getElementById("authModeToggle");
    const authSwitchPrompt = document.getElementById("authSwitchPrompt");

    const appLayout = document.querySelector(".app-layout");

    let authMode = "login";
    // =================================
    // SWITCH LOGIN / SIGN-UP MODE
    // =================================

    authModeToggle.addEventListener("click", () => {
        authMode = authMode === "login" ? "signup" : "login";

        authTitle.textContent =
            authMode === "login" ? "Welcome back" : "Create your account";

        authSubtitle.textContent =
            authMode === "login"
                ? "Sign in to your little space."
                : "Create an account for your little space.";

        authSubmit.textContent =
            authMode === "login" ? "Sign in" : "Create account";

        authSwitchPrompt.textContent =
            authMode === "login" ? "New here?" : "Already have an account?";

        authModeToggle.textContent =
            authMode === "login" ? "Create an account" : "Sign in";

        authPassword.autocomplete =
            authMode === "login" ? "current-password" : "new-password";

        authError.hidden = true;
    });
    // =================================
    // HANDLE LOGIN / SIGN-UP
    // =================================

    authForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const email = authEmail.value.trim();
        const password = authPassword.value;

        authError.hidden = true;
        authSubmit.disabled = true;
        authSubmit.textContent = "Please wait...";

        try {
            if (authMode === "signup") {
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }

            authForm.reset();

        } catch (error) {
            console.error("Authentication error:", error);

            const messages = {
                "auth/email-already-in-use": "This email already has an account. Try signing in.",
                "auth/invalid-email": "Please enter a valid email address.",
                "auth/weak-password": "Your password must be at least 6 characters.",
                "auth/invalid-credential": "Incorrect email or password.",
                "auth/user-not-found": "No account was found with that email.",
                "auth/wrong-password": "Incorrect password.",
                "auth/too-many-requests": "Too many attempts. Please try again later."
            };

            authError.textContent =
                messages[error.code] || "Something went wrong. Please try again.";

            authError.hidden = false;

        } finally {
            authSubmit.disabled = false;
            authSubmit.textContent =
                authMode === "login" ? "Sign in" : "Create account";
        }
    });
    // =================================
    // CHECK SIGN-IN STATUS
    // =================================

    authReady.then(() => {
        onAuthStateChanged(auth, async (user) => {
            console.log("Currently authenticated UID:", user?.uid);
            if (user) {
                const account = accounts[user.uid];

                // Reject accounts outside our two authorized users
                if (!account) {
                    stopListeners();
                    await signOut(auth);
                    authError.textContent =
                        "This account is not authorized to access Our Little Space.";
                    authError.hidden = false;
                    authScreen.hidden = false;
                    appLayout.hidden = true;
                    return;
                }

                // Load the correct profile
                currentAccount = account;

                authScreen.hidden = true;
                appLayout.hidden = false;

                setAccount(user.uid);
                startListeners(user.uid);

            } else {
                stopListeners();
                authScreen.hidden = false;
                appLayout.hidden = true;
            }
        });
    }).catch((error) => {
        console.error("Firebase authentication setup failed:", error);
        authScreen.hidden = false;
        appLayout.hidden = true;
    });

    const postInput = document.getElementById("postInput");
    const publishButton = document.getElementById("publishPost");
    const timeline = document.getElementById("timeline");
    const characterCount = document.getElementById("characterCount");
    // =================================
    // FIRESTORE COLLECTIONS
    // =================================

    const postsCollection = collection(db, "posts");
    const commentsCollection = collection(db, "comments");
    const likesCollection = collection(db, "likes");
    const repostsCollection = collection(db, "reposts");
    const bookmarksCollection = collection(db, "bookmarks");
    const notificationsCollection = collection(db, "notifications");

    let firestorePosts = [];

    const postsQuery = query(
        postsCollection,
        orderBy("createdAt", "desc")
    );

    // Active Firestore subscriptions (started after sign-in, stopped on sign-out)
    let unsubscribers = [];
    let listenersOwnerUid = null;

    const themeToggle = document.getElementById("themeToggle");
    const mobileThemeToggle = document.getElementById("mobileThemeToggle");

    const moreToggle = document.getElementById("mobileMoreToggle");
    const moreMenu = document.getElementById("mobileMoreMenu");

    let currentFeed = "for-you";

    let currentPage = "home";

    const pageTitles = {
        home: ["Home", "A little update from our little world."],
        explore: ["Explore", "Discover little moments."],
        notifications: ["Notifications", "See what's happening."],
        bookmarks: ["Bookmarks", "Keep the moments you love."],
        profile: ["My Profile", "Your own little corner."],
        memories: ["Memories", "Little moments worth keeping."],
        together: ["Together", "Everything we share."]
    };


    // =================================
    // ICON MANAGEMENT
    // =================================

    function refreshIcons() {
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }


    // =================================
    // SHARED INTERACTION STATE (mirrors Firestore)
    // =================================

    const likesByPost = new Map();      // postId -> Set(uid)
    const repostsByPost = new Map();    // postId -> Set(uid)
    const bookmarkedPostIds = new Set();
    const commentsById = new Map();     // commentId -> comment (ordered by createdAt)
    const notifications = [];
    const pendingActions = new Set();   // blocks double-clicks while a write is in flight

    // Presence: each signed-in device writes a heartbeat; someone is "online"
    // if their last heartbeat is recent.
    const presenceCollection = collection(db, "presence");
    const presenceByUid = new Map();    // uid -> { online, lastSeen: Date|null }
    const HEARTBEAT_MS = 60 * 1000;
    const PRESENCE_TTL_MS = 3 * 60 * 1000;
    let presenceUid = null;
    let heartbeatTimer = null;
    let presenceRefreshTimer = null;

    const toDate = value => (value?.toDate ? value.toDate() : new Date());

    function timeAgo(date) {
        const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
        if (seconds < 60) return "Just now";

        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;

        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;

        const sameYear = date.getFullYear() === new Date().getFullYear();
        return date.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            ...(sameYear ? {} : { year: "numeric" })
        });
    }

    // Keeps every "5m ago" label fresh without re-rendering anything
    function refreshTimestamps() {
        document.querySelectorAll("time[data-timestamp]").forEach(element => {
            const timestamp = Number(element.dataset.timestamp);
            if (timestamp) {
                element.textContent = timeAgo(new Date(timestamp));
            }
        });
    }

    // ---- @mentions: parsing and rendering ----
    // A mention is "@username" that exactly matches one of our two accounts.
    const MENTION_REGEX = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]+)/g;

    function findAccountByUsername(username) {
        const lower = username.toLowerCase();
        return Object.values(accounts).find(
            account => account.username.toLowerCase() === lower
        ) || null;
    }

    function extractMentionedIds(text) {
        const ids = new Set();
        for (const match of text.matchAll(MENTION_REGEX)) {
            const account = findAccountByUsername(match[2]);
            if (account) ids.add(account.id);
        }
        return Array.from(ids);
    }

    // Fills an element with text, turning real @mentions into styled spans.
    // Uses text nodes only (never innerHTML), so user text can't inject markup.
    function appendTextWithMentions(parent, text) {
        let last = 0;

        for (const match of text.matchAll(MENTION_REGEX)) {
            const account = findAccountByUsername(match[2]);
            if (!account) continue;

            const start = match.index + match[1].length;
            if (start > last) {
                parent.append(document.createTextNode(text.slice(last, start)));
            }

            const mention = document.createElement("span");
            mention.className = "mention";
            mention.dataset.mentionId = account.id;
            mention.textContent = `@${account.username}`;
            parent.append(mention);

            last = start + 1 + match[2].length;
        }

        if (last < text.length) {
            parent.append(document.createTextNode(text.slice(last)));
        }
    }

    function getPost(postId) {
        return firestorePosts.find(post => post.id === postId) || null;
    }


    async function deletePostAndRelatedData(postId) {
        const relatedCollections = [
            "comments",
            "likes",
            "reposts",
            "bookmarks",
            "notifications"
        ];

        const relatedDocuments = [];

        // Find every document connected to this post.
        for (const collectionName of relatedCollections) {
            const snapshot = await getDocs(
                query(
                    collection(db, collectionName),
                    where("postId", "==", postId)
                )
            );

            snapshot.forEach(documentSnapshot => {
                relatedDocuments.push(documentSnapshot.ref);
            });
        }

        // Delete related documents in safe batches.
        const batchSize = 450;

        for (let i = 0; i < relatedDocuments.length; i += batchSize) {
            const batch = writeBatch(db);
            const chunk = relatedDocuments.slice(i, i + batchSize);

            chunk.forEach(documentRef => {
                batch.delete(documentRef);
            });

            await batch.commit();
        }

        // Delete the original post last.
        await deleteDoc(doc(db, "posts", postId));
    }

    // =================================
    // NOTIFICATION SYSTEM
    // =================================

    const notificationsList = document.getElementById("notificationsList");

    const notificationMessages = {
        like: "liked your post",
        comment: "commented on your post",
        reply: "replied to your comment",
        mention: "mentioned you"
    };

    const notificationIcons = {
        like: "heart",
        comment: "message-circle",
        reply: "reply",
        mention: "at-sign"
    };

    function updateNotificationBadge() {

        const unreadCount = notifications.filter(
            notification =>
                notification.recipientId === currentAccount.id &&
                !notification.read
        ).length;

        document.querySelectorAll("[data-notification-badge]").forEach(badge => {
            badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
            badge.hidden = unreadCount === 0;
        });

        document.querySelectorAll('[data-page="notifications"]').forEach(link => {
            link.setAttribute(
                "aria-label",
                unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"
            );
        });

    }

    function syncLikes() {

        document.querySelectorAll(".post-card").forEach(card => {
            const postId = card.dataset.postId;
            if (!postId) return;

            const button = card.querySelector(".like-action");
            if (!button) return;

            const likers = likesByPost.get(postId) || new Set();
            button.classList.toggle("active", likers.has(currentAccount.id));

            const count = button.querySelector("span");
            if (count) {
                count.textContent = String(likers.size);
            }
        });

    }

    function syncReposts() {

        document.querySelectorAll(".post-card").forEach(card => {
            const postId = card.dataset.postId;
            if (!postId) return;

            const button = card.querySelector(".repost-action");
            if (!button) return;

            const reposters = repostsByPost.get(postId) || new Set();
            button.classList.toggle("active", reposters.has(currentAccount.id));

            const count = button.querySelector("span");
            if (count) {
                count.textContent = String(reposters.size);
            }
        });

    }

    function syncBookmarks() {

        document.querySelectorAll(".post-card").forEach(card => {
            card.querySelector(".bookmark-action")
                ?.classList.toggle("active", bookmarkedPostIds.has(card.dataset.postId));
        });

    }

    function syncInteractions() {
        syncLikes();
        syncReposts();
        syncBookmarks();
    }

    function renderBookmarks() {

        const list = document.getElementById("bookmarksList");
        if (!list) return;

        list.innerHTML = "";

        const saved = Array.from(timeline.querySelectorAll(".post-card"))
            .filter(post => bookmarkedPostIds.has(post.dataset.postId));

        if (saved.length === 0) {
            list.innerHTML = `
                <div class="explore-empty-state">
                    <div class="explore-empty-icon">
                        <i data-lucide="bookmark"></i>
                    </div>
                    <h3>Nothing saved just yet</h3>
                    <p>
                        When you bookmark a post, you'll find it waiting here.
                    </p>
                </div>
            `;
            refreshIcons();
            return;
        }

        saved.forEach(post => {
            const clone = post.cloneNode(true);
            clone.dataset.bookmarkId = post.dataset.postId;
            list.appendChild(clone);
        });

        syncInteractions();
        refreshIcons();
    }

    function renderNotifications() {

        updateNotificationBadge();

        if (!notificationsList) return;

        const accountNotifications = notifications.filter(
            notification => notification.recipientId === currentAccount.id
        );

        notificationsList.innerHTML = "";

        if (accountNotifications.length === 0) {
            notificationsList.innerHTML = `
                <div class="explore-empty-state" id="notificationsEmpty">
                    <div class="explore-empty-icon">
                        <i data-lucide="bell-ring"></i>
                    </div>
                    <h3>Nothing new for now</h3>
                    <p>
                        When something happens in our little space,
                        you'll find it here.
                    </p>
                </div>
            `;
            refreshIcons();
            return;
        }

        accountNotifications.forEach(notification => {
            const actor = accounts[notification.actorId];
            if (!actor) {
                console.error(`Unknown notification actor: ${notification.actorId}`);
                return;
            }

            const item = document.createElement("div");
            item.className = `notification-item${notification.read ? "" : " unread"}`;
            item.dataset.notificationId = notification.id;
            item.dataset.postId = notification.postId;
            if (notification.commentId) {
                item.dataset.commentId = notification.commentId;
            }
            item.setAttribute("role", "button");
            item.setAttribute("tabindex", "0");

            const iconContainer = document.createElement("div");
            iconContainer.className = "notification-icon";

            const icon = document.createElement("i");
            icon.setAttribute("data-lucide", notificationIcons[notification.type]);
            iconContainer.appendChild(icon);

            const details = document.createElement("div");
            details.className = "notification-details";

            const message = document.createElement("p");
            const actorName = document.createElement("strong");
            actorName.textContent = actor.name;
            message.append(actorName, ` ${notificationMessages[notification.type]}`);
            details.appendChild(message);

            if (notification.snippet) {
                const snippet = document.createElement("p");
                snippet.className = "notification-snippet";
                snippet.textContent = notification.snippet;
                details.appendChild(snippet);
            }

            const time = document.createElement("time");
            time.dateTime = notification.createdAt.toISOString();
            time.dataset.timestamp = String(notification.createdAt.getTime());
            time.textContent = timeAgo(notification.createdAt);
            details.appendChild(time);

            item.append(iconContainer, details);
            notificationsList.appendChild(item);
        });

        refreshIcons();
    }

    async function markNotificationsRead() {

        const unread = notifications.filter(
            notification =>
                notification.recipientId === currentAccount.id &&
                !notification.read
        );

        if (unread.length === 0) return;

        try {
            const batch = writeBatch(db);
            unread.forEach(notification => {
                batch.update(doc(db, "notifications", notification.id), { read: true });
            });
            await batch.commit();
        } catch (error) {
            console.error("Could not mark notifications as read:", error);
        }
    }

    function openPostThread(postId, commentId = null) {

        const originalPost = Array.from(
            timeline.querySelectorAll(".post-card")
        ).find(post => post.dataset.postId === postId);

        if (!originalPost) {
            console.error(`Cannot open notification post: ${postId}`);
            return false;
        }

        navigateTo("home", false);

        let target = originalPost;

        if (commentId) {
            const commentsSection = originalPost.querySelector(".post-comments");
            if (commentsSection) {
                commentsSection.hidden = false;
            }

            const comment = Array.from(
                originalPost.querySelectorAll(".post-comment")
            ).find(item => item.dataset.commentId === commentId);

            if (comment) {
                target = comment;
                comment.classList.add("reply-highlight");
                setTimeout(() => comment.classList.remove("reply-highlight"), 2200);
            }
        }

        target.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

        return true;
    }

    function openNotification(item) {

        const notification = notifications.find(
            entry => entry.id === item.dataset.notificationId
        );

        if (!notification) return;

        if (!openPostThread(notification.postId, notification.commentId)) return;

        if (!notification.read) {
            updateDoc(doc(db, "notifications", notification.id), { read: true })
                .catch(error => console.error("Could not mark notification as read:", error));
        }
    }

    notificationsList?.addEventListener("click", event => {
        const item = event.target.closest(".notification-item");
        if (item) {
            openNotification(item);
        }
    });

    notificationsList?.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;

        const item = event.target.closest(".notification-item");
        if (!item) return;

        event.preventDefault();
        openNotification(item);
    });

    document.addEventListener("accountchange", () => {
        syncInteractions();
        renderNotifications();
        renderBookmarks();
    });


    // =================================
    // THEME MANAGEMENT
    // =================================

    function applyTheme(theme) {

        html.setAttribute("data-theme", theme);

        const dark = theme === "dark";
        const icon = dark ? "sun" : "moon";
        const label = dark ? "Light appearance" : "Dark appearance";

        const themeIcon = document.getElementById("themeIcon");
        const themeLabel = document.getElementById("themeLabel");

        if (themeIcon) {
            themeIcon.setAttribute("data-lucide", icon);
        }

        if (themeLabel) {
            themeLabel.textContent = label;
        }

        if (mobileThemeToggle) {
            mobileThemeToggle.innerHTML = `<i data-lucide="${icon}"></i>`;
        }

        localStorage.setItem("ols-theme", theme);

        refreshIcons();
    }

    applyTheme(localStorage.getItem("ols-theme") || "light");

    function toggleTheme() {
        const current = html.getAttribute("data-theme");
        applyTheme(current === "light" ? "dark" : "light");
    }

    themeToggle?.addEventListener("click", toggleTheme);
    mobileThemeToggle?.addEventListener("click", toggleTheme);

    // =================================
    // ACCOUNTS
    // =================================


    const accounts = {
        "7sVo7y23TPU97iKV93ht2MlHE413": {
            id: "7sVo7y23TPU97iKV93ht2MlHE413",
            name: "You",
            username: "yourusername",
            bio: "Just me, sharing little thoughts and moments from my world. ♡",
            avatarClass: "avatar-you",
            avatarText: "Y"
        },

        "cfmc82SzpygCBmHR2JZzCNl4LBy1": {
            id: "cfmc82SzpygCBmHR2JZzCNl4LBy1",
            name: "Your person",
            username: "herusername",
            bio: "A little corner for my thoughts and moments. ♡",
            avatarClass: "avatar-her",
            avatarText: "♡"
        }
    };

    function loadSavedProfiles() {
        try {
            const savedProfiles = JSON.parse(
                localStorage.getItem("ols-profiles") || "{}"
            );

            Object.keys(accounts).forEach(id => {
                const saved = savedProfiles[id];

                if (!saved || typeof saved !== "object") return;

                if (typeof saved.name === "string") {
                    accounts[id].name = saved.name;
                }

                if (typeof saved.username === "string") {
                    accounts[id].username = saved.username;
                }

                if (typeof saved.bio === "string") {
                    accounts[id].bio = saved.bio;
                }
                if (typeof saved.avatarImage === "string") {
                    accounts[id].avatarImage = saved.avatarImage;
                }
            });

        } catch (error) {
            console.error("Could not load saved profiles:", error);
        }
    }

    const usersCollection = collection(db, "users");

    let currentAccount = accounts["7sVo7y23TPU97iKV93ht2MlHE413"];
    function getAccountById(accountId) {
        return accounts[accountId] || null;
    }

    // =================================
    // FIRESTORE LISTENERS (one set, tied to the signed-in user)
    // =================================

    // =================================
    // PRESENCE + "OUR LITTLE CIRCLE" CARD
    // =================================

    function isOnline(uid) {
        if (uid === auth.currentUser?.uid) return true;
        const presence = presenceByUid.get(uid);
        if (!presence || !presence.online || !presence.lastSeen) return false;
        return Date.now() - presence.lastSeen.getTime() < PRESENCE_TTL_MS;
    }

    function renderPeople() {
        document.querySelectorAll(".people-card .person-row[data-account]").forEach(row => {
            const account = accounts[row.dataset.account];
            if (!account) return;

            const avatar = row.querySelector(".avatar");
            if (avatar) {
                avatar.className = `avatar ${account.avatarClass}`;
                updateAvatarImage(avatar, account);
            }

            const name = row.querySelector(".person-info strong");
            const username = row.querySelector(".person-info span");
            if (name) name.textContent = account.name;
            if (username) username.textContent = `@${account.username}`;

            const dot = row.querySelector(".online-dot");
            if (dot) {
                const online = isOnline(account.id);
                dot.classList.toggle("is-offline", !online);
                const label = online ? "Online" : "Offline";
                dot.title = label;
                dot.setAttribute("aria-label", label);
            }
        });
    }

    async function writePresence(online) {
        if (!presenceUid) return;
        await setDoc(doc(db, "presence", presenceUid), {
            online,
            lastSeen: serverTimestamp()
        }, { merge: true });
    }

    function beat() {
        writePresence(true).catch(error => console.error("Presence update failed:", error));
    }

    async function setOffline() {
        if (!presenceUid) return;
        try {
            await writePresence(false);
        } catch (error) {
            console.error("Could not mark offline:", error);
        }
    }

    function onVisibilityChange() {
        if (document.visibilityState === "visible" && presenceUid) beat();
    }

    function onPageHide() {
        // Best effort only; the heartbeat timeout covers cases where this doesn't finish
        if (presenceUid) writePresence(false).catch(() => { });
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    function startPresence(uid) {
        stopPresence();
        presenceUid = uid;
        beat();
        heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
        presenceRefreshTimer = setInterval(renderPeople, 15000);
    }

    function stopPresence() {
        clearInterval(heartbeatTimer);
        clearInterval(presenceRefreshTimer);
        heartbeatTimer = null;
        presenceRefreshTimer = null;
        presenceUid = null;
        presenceByUid.clear();
    }

    function startListeners(uid) {

        // Never subscribe twice for the same user
        if (listenersOwnerUid === uid) return;

        stopListeners();
        listenersOwnerUid = uid;

        const fail = label => error => {
            console.error(`Error loading ${label}:`, error);
        };

        unsubscribers.push(

            // Posts
            onSnapshot(postsQuery, snapshot => {
                firestorePosts = snapshot.docs.map(document => ({
                    id: document.id,
                    ...document.data({ serverTimestamps: "estimate" })
                }));
                renderFirestorePosts();
            }, fail("posts")),

            // Profiles
            onSnapshot(usersCollection, snapshot => {
                let usernamesChanged = false;

                snapshot.forEach(userDoc => {
                    const account = accounts[userDoc.id];
                    if (!account) return;

                    const profile = userDoc.data();

                    if (typeof profile.name === "string") {
                        account.name = profile.name;
                    }
                    if (typeof profile.username === "string") {
                        if (account.username !== profile.username) {
                            usernamesChanged = true;
                        }
                        account.username = profile.username;
                    }
                    if (typeof profile.bio === "string") {
                        account.bio = profile.bio;
                    }
                    if (typeof profile.avatarImage === "string") {
                        account.avatarImage = profile.avatarImage;
                    }
                    if (typeof profile.coverImage === "string") {
                        account.coverImage = profile.coverImage;
                    }
                });

                setAccount(currentAccount.id);

                if (usernamesChanged) {
                    renderFirestorePosts();
                }
            }, fail("profiles")),

            // Likes
            onSnapshot(likesCollection, snapshot => {
                likesByPost.clear();
                snapshot.forEach(likeDoc => {
                    const { postId, userId } = likeDoc.data();
                    if (!likesByPost.has(postId)) likesByPost.set(postId, new Set());
                    likesByPost.get(postId).add(userId);
                });
                renderProfileLikes();
                syncInteractions();
            }, fail("likes")),

            // Reposts
            onSnapshot(repostsCollection, snapshot => {
                repostsByPost.clear();
                snapshot.forEach(repostDoc => {
                    const { postId, userId } = repostDoc.data();
                    if (!repostsByPost.has(postId)) repostsByPost.set(postId, new Set());
                    repostsByPost.get(postId).add(userId);
                });
                syncReposts();
            }, fail("reposts")),

            // Bookmarks (only this user's)
            onSnapshot(
                query(bookmarksCollection, where("userId", "==", uid)),
                snapshot => {
                    bookmarkedPostIds.clear();
                    snapshot.forEach(bookmarkDoc => {
                        bookmarkedPostIds.add(bookmarkDoc.data().postId);
                    });
                    renderBookmarks();
                    syncBookmarks();
                },
                fail("bookmarks")
            ),

            // Comments and replies
            onSnapshot(
                query(commentsCollection, orderBy("createdAt", "asc")),
                snapshot => {
                    commentsById.clear();
                    snapshot.docs.forEach(commentDoc => {
                        const data = commentDoc.data({ serverTimestamps: "estimate" });
                        commentsById.set(commentDoc.id, {
                            id: commentDoc.id,
                            ...data,
                            createdAt: toDate(data.createdAt)
                        });
                    });
                    renderAllComments();
                    renderProfileReplies();
                },
                fail("comments")
            ),

            // Presence
            onSnapshot(presenceCollection, snapshot => {
                presenceByUid.clear();
                snapshot.forEach(presenceDoc => {
                    const data = presenceDoc.data({ serverTimestamps: "estimate" });
                    presenceByUid.set(presenceDoc.id, {
                        online: data.online === true,
                        lastSeen: data.lastSeen?.toDate ? data.lastSeen.toDate() : null
                    });
                });
                renderPeople();
            }, fail("presence")),

            // Notifications (only this user's)
            onSnapshot(
                query(notificationsCollection, where("recipientId", "==", uid)),
                snapshot => {
                    const items = snapshot.docs.map(notificationDoc => {
                        const data = notificationDoc.data({ serverTimestamps: "estimate" });
                        return {
                            id: notificationDoc.id,
                            ...data,
                            createdAt: toDate(data.createdAt)
                        };
                    });

                    items.sort((a, b) => b.createdAt - a.createdAt);

                    // Replace wholesale so listener updates can never duplicate items
                    notifications.length = 0;
                    notifications.push(...items);
                    renderNotifications();
                },
                fail("notifications")
            )
        );

        startPresence(uid);
    }

    function stopListeners() {

        stopPresence();
        unsubscribers.forEach(unsubscribe => unsubscribe());
        unsubscribers = [];
        listenersOwnerUid = null;

        firestorePosts = [];
        likesByPost.clear();
        repostsByPost.clear();
        bookmarkedPostIds.clear();
        commentsById.clear();
        notifications.length = 0;

        renderFirestorePosts();
        renderBookmarks();
        renderNotifications();
        renderProfileReplies();
        renderProfileLikes();
        renderPeople();
    }

    function updateAvatarImage(avatar, account) {
        if (account.avatarImage) {
            avatar.style.backgroundImage = `url("${account.avatarImage}")`;
            avatar.style.backgroundSize = "cover";
            avatar.style.backgroundPosition = "center";
            avatar.textContent = "";
        } else {
            avatar.style.backgroundImage = "";
            avatar.textContent = account.avatarText;
        }
    }

    // Shows the account's cover photo, or falls back to the default pink cover
    function updateCoverImage(cover, account) {
        if (account.coverImage) {
            // "important" so the photo wins over any pink background in the stylesheet
            cover.style.setProperty("background-image", `url("${account.coverImage}")`, "important");
            cover.style.setProperty("background-size", "cover", "important");
            cover.style.setProperty("background-position", "center", "important");
            cover.style.setProperty("background-repeat", "no-repeat", "important");
            cover.classList.add("has-cover-photo");
        } else {
            cover.style.removeProperty("background-image");
            cover.style.removeProperty("background-size");
            cover.style.removeProperty("background-position");
            cover.style.removeProperty("background-repeat");
            cover.classList.remove("has-cover-photo");
        }
    }

    function setAccount(id) {

        const account = accounts[id];
        if (!account) {
            console.error(`Unknown test account: ${id}`);
            return;
        }

        currentAccount = account;
        // Update the Profile page
        const profileAvatar = document.getElementById("profileAvatar");
        const profileDisplayName = document.getElementById("profileDisplayName");
        const profileUsername = document.getElementById("profileUsername");
        const profileBio = document.getElementById("profileBio");

        if (profileAvatar) {
            profileAvatar.className = `profile-avatar avatar ${account.avatarClass}`;
            updateAvatarImage(profileAvatar, account);
        }

        if (profileDisplayName) {
            profileDisplayName.textContent = account.name;
        }

        if (profileUsername) {
            profileUsername.textContent = `@${account.username}`;
        }

        if (profileBio) {
            profileBio.textContent = account.bio;
        }

        const profileCover = document.querySelector(".profile-cover");
        if (profileCover) {
            updateCoverImage(profileCover, account);
        }
        localStorage.setItem("ols-account", id);
        html.dataset.account = id;

        document.querySelectorAll(".dev-switch-option").forEach(button => {
            const active = button.dataset.account === id;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });

        const mini = document.querySelector(".mini-profile");
        if (mini) {
            const avatar = mini.querySelector(".avatar");
            if (avatar) {
                avatar.className = `avatar ${currentAccount.avatarClass}`;
                updateAvatarImage(avatar, currentAccount);
            }

            const name = mini.querySelector(".profile-info strong");
            const username = mini.querySelector(".profile-info span");
            if (name) name.textContent = currentAccount.name;
            if (username) username.textContent = `@${currentAccount.username}`;
        }

        const composerAvatar = document.querySelector("#composer .avatar");
        if (composerAvatar) {
            composerAvatar.className = `avatar ${currentAccount.avatarClass}`;
            updateAvatarImage(composerAvatar, currentAccount);
        }

        timeline.querySelectorAll(".post-card").forEach(post => {
            const postAccount = accounts[post.dataset.authorId];
            if (!postAccount) return;

            // Update the author's name
            const authorName = post.querySelector(".post-author strong");
            if (authorName) {
                authorName.textContent = postAccount.name;
            }

            // Update the author's username
            const authorUsername = post.querySelector(".post-author span:first-of-type");
            if (authorUsername) {
                authorUsername.textContent = `@${postAccount.username}`;
            }

            // Update the author's avatar
            const avatar = post.querySelector(".post-avatar");
            if (avatar) {
                avatar.className = `post-avatar avatar ${postAccount.avatarClass}`;
                updateAvatarImage(avatar, postAccount);
            }
        });

        // Keep comment author names in sync with profile changes
        document.querySelectorAll(".post-comment").forEach(comment => {
            const commentAccount = accounts[comment.dataset.authorId];
            const nameEl = comment.querySelector(":scope > strong");
            if (commentAccount && nameEl) {
                nameEl.textContent = commentAccount.name;
            }
        });

        renderProfilePosts();
        renderProfileReplies();
        renderProfileLikes();
        renderPeople();
        document.dispatchEvent(new CustomEvent("accountchange", {
            detail: currentAccount
        }));
    }

    // Writes are authorized by the signed-in UID, so only that account may be selected.
    document.querySelectorAll(".dev-switch-option").forEach(button => {
        button.addEventListener("click", () => {
            if (button.dataset.account !== auth.currentUser?.uid) return;
            setAccount(button.dataset.account);
        });
    });

    // =================================
    // NAVIGATION
    // =================================


    function navigateTo(page, scrollToTop = true) {
        const details = pageTitles[page];

        if (!details) return;

        if (currentPage === "notifications" && page !== "notifications") {
            markNotificationsRead();
        }

        currentPage = page;

        // Close all open comment sections when changing pages
        document.querySelectorAll(".post-comments").forEach(section => {
            section.hidden = true;
        });

        document.querySelectorAll(".thread-reply-form").forEach(form => {
            form.hidden = true;
        });

        document.querySelectorAll(".post-card.is-replying").forEach(post => {
            post.classList.remove("is-replying");
        });

        document.querySelectorAll(".post-card").forEach(post => {
            syncCommentForms(post);
        });

        document.getElementById("pageTitle").textContent = details[0];
        document.getElementById("pageSubtitle").textContent = details[1];

        // Switch between available pages
        document.querySelectorAll(".page-view").forEach(section => {
            section.hidden = section.id !== `${page}Page`;
        });

        // Update active navigation
        document.querySelectorAll(
            ".sidebar-menu [data-page], .mobile-nav [data-page], .mobile-more-menu [data-page]"
        ).forEach(link => {
            link.classList.toggle("active", link.dataset.page === page);
        });

        // Close mobile More menu
        if (moreMenu) {
            moreMenu.hidden = true;
        }

        if (moreToggle) {
            moreToggle.setAttribute("aria-expanded", "false");
        }

        // Update feed selection
        document.querySelectorAll(".feed-tab").forEach(tab => {
            tab.classList.toggle(
                "active",
                page === "together"
                    ? tab.dataset.feed === "together"
                    : tab.dataset.feed === "for-you"
            );
        });

        currentFeed = page === "together" ? "together" : "for-you";

        if (scrollToTop) {
            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        }

        if (page === "notifications") {
            renderNotifications();
        }
    }


    document.querySelectorAll("[data-page]").forEach(link => {

        link.addEventListener("click", event => {

            event.preventDefault();

            navigateTo(link.dataset.page);

        });

    });



    // =================================
    // EXPLORE SEARCH
    // =================================

    const exploreSearch = document.getElementById("exploreSearch");
    const exploreResults = document.getElementById("exploreResults");
    const clearExploreSearch = document.getElementById("clearExploreSearch");
    const exploreDiscovery = document.getElementById("exploreDiscovery");
    const exploreResultsSection = document.getElementById("exploreResultsSection");

    exploreSearch?.addEventListener("input", () => {
        const query = exploreSearch.value.trim().toLowerCase();

        if (clearExploreSearch) {
            clearExploreSearch.hidden = query.length === 0;
        }

        exploreResults.innerHTML = "";

        // Show discovery cards only when not searching
        if (exploreDiscovery) {
            exploreDiscovery.hidden = query.length > 0;
        }

        if (exploreResultsSection) {
            exploreResultsSection.hidden = query.length === 0;
        }

        if (!query) {
            exploreResults.innerHTML = `
        <div class="explore-empty-state">
            <div class="explore-empty-icon">
                <i data-lucide="heart"></i>
            </div>
            <h3>A little something to find?</h3>
            <p>
                Search for a word, a thought, or a moment
                you've shared with each other.
            </p>
        </div>
    `;

            refreshIcons();
            return;
        }

        const posts = Array.from(timeline.querySelectorAll(".post-card"));
        const matches = posts.filter(post =>
            post.textContent.toLowerCase().includes(query)
        );

        if (matches.length === 0) {
            exploreResults.innerHTML = `
    <div class="explore-empty-state">
        <div class="explore-empty-icon">
            <i data-lucide="search-x"></i>
        </div>
        <h3>No little moments found</h3>
        <p>Try another word. Maybe it's hiding somewhere. ♡</p>
    </div>
`;

            refreshIcons();
            return;
        }

        matches.forEach(post => {
            const completePost = post.cloneNode(true);
            completePost.classList.add("explore-result-post");

            exploreResults.appendChild(completePost);
        });

        syncInteractions();
        refreshIcons();
    });

    clearExploreSearch?.addEventListener("click", () => {
        exploreSearch.value = "";
        exploreSearch.dispatchEvent(new Event("input"));
        exploreSearch.focus();
    });


    // =================================
    // MOBILE MORE MENU
    // =================================

    moreToggle?.addEventListener("click", () => {

        const isOpen = !moreMenu.hidden;

        moreMenu.hidden = isOpen;

        moreToggle.setAttribute("aria-expanded", String(!isOpen));

    });

    document.addEventListener("click", event => {

        if (!moreMenu || !moreToggle) return;

        if (
            !moreMenu.contains(event.target) &&
            !moreToggle.contains(event.target)
        ) {
            moreMenu.hidden = true;
            moreToggle.setAttribute("aria-expanded", "false");
        }

    });


    // =================================
    // FEED TABS
    // =================================

    document.querySelectorAll(".feed-tab").forEach(tab => {

        tab.addEventListener("click", () => {

            document.querySelectorAll(".feed-tab").forEach(item => {
                item.classList.remove("active");
            });

            tab.classList.add("active");

            currentFeed = tab.dataset.feed;

        });

    });


    // =================================
    // COMPOSER
    // =================================

    postInput.addEventListener("input", () => {
        const length = postInput.value.length;

        characterCount.textContent = `${length} characters`;
        publishButton.disabled = postInput.value.trim().length === 0;
        characterCount.style.color = "";

        postInput.style.height = "auto";
        postInput.style.height = `${postInput.scrollHeight}px`;
    });


    // =================================
    // @MENTION AUTOCOMPLETE
    // =================================

    const mentionMenu = document.createElement("div");
    mentionMenu.className = "mention-menu";
    mentionMenu.setAttribute("role", "listbox");
    mentionMenu.hidden = true;
    document.body.appendChild(mentionMenu);

    let mentionState = null;   // { input, start, items, index }

    function closeMentionMenu() {
        mentionMenu.hidden = true;
        mentionState = null;
    }

    function highlightMention() {
        if (!mentionState) return;

        mentionMenu.querySelectorAll(".mention-option").forEach((option, index) => {
            const active = index === mentionState.index;
            option.classList.toggle("active", active);
            option.setAttribute("aria-selected", String(active));
        });
    }

    function positionMentionMenu(input) {
        const rect = input.getBoundingClientRect();
        const width = mentionMenu.offsetWidth;
        const height = mentionMenu.offsetHeight;

        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        const below = rect.bottom + 6;
        const top = below + height > window.innerHeight
            ? Math.max(8, rect.top - height - 6)
            : below;

        mentionMenu.style.left = `${left}px`;
        mentionMenu.style.top = `${top}px`;
    }

    function updateMentionMenu(input) {

        const caret = input.selectionStart;

        if (caret === null || caret !== input.selectionEnd) {
            closeMentionMenu();
            return;
        }

        const match = input.value
            .slice(0, caret)
            .match(/(^|[^A-Za-z0-9_])@([A-Za-z0-9_]*)$/);

        if (!match) {
            closeMentionMenu();
            return;
        }

        const query = match[2].toLowerCase();

        // The other person first, then yourself
        const items = Object.values(accounts)
            .filter(account =>
                account.username.toLowerCase().startsWith(query) ||
                account.name.toLowerCase().startsWith(query)
            )
            .sort((a, b) =>
                (a.id === currentAccount.id) - (b.id === currentAccount.id)
            );

        if (items.length === 0) {
            closeMentionMenu();
            return;
        }

        mentionState = {
            input,
            start: caret - match[2].length - 1,
            items,
            index: 0
        };

        mentionMenu.innerHTML = "";

        items.forEach((account, index) => {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "mention-option";
            option.setAttribute("role", "option");
            option.dataset.index = String(index);

            const avatar = document.createElement("div");
            avatar.className = `avatar ${account.avatarClass}`;
            updateAvatarImage(avatar, account);

            const info = document.createElement("div");
            info.className = "mention-option-info";

            const name = document.createElement("strong");
            name.textContent = account.name;

            const handle = document.createElement("span");
            handle.textContent = `@${account.username}`;

            info.append(name, handle);
            option.append(avatar, info);
            mentionMenu.appendChild(option);
        });

        mentionMenu.hidden = false;
        highlightMention();
        positionMentionMenu(input);
    }

    function chooseMention(account) {

        if (!mentionState || !account) return;

        const { input, start } = mentionState;
        const caret = input.selectionStart;
        const insert = `@${account.username} `;
        const newValue = input.value.slice(0, start) + insert + input.value.slice(caret);

        if (input.maxLength > 0 && newValue.length > input.maxLength) {
            closeMentionMenu();
            return;
        }

        input.value = newValue;

        const position = start + insert.length;
        input.setSelectionRange(position, position);

        closeMentionMenu();

        // Lets the composer update its character count and height
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
    }

    // Picking with the mouse/finger (mousedown keeps the input focused)
    mentionMenu.addEventListener("mousedown", event => {
        event.preventDefault();

        const option = event.target.closest(".mention-option");
        if (!option || !mentionState) return;

        chooseMention(mentionState.items[Number(option.dataset.index)]);
    });

    const isMentionField = element =>
        Boolean(element?.matches?.("#postInput, .comment-input"));

    document.addEventListener("input", event => {
        if (isMentionField(event.target)) updateMentionMenu(event.target);
    });

    document.addEventListener("click", event => {
        if (isMentionField(event.target)) updateMentionMenu(event.target);
    });

    document.addEventListener("keyup", event => {
        if (!isMentionField(event.target)) return;

        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            updateMentionMenu(event.target);
        }
    });

    // Capture phase so Enter picks a mention instead of posting/submitting
    document.addEventListener("keydown", event => {

        if (!mentionState || mentionMenu.hidden) return;
        if (event.target !== mentionState.input) return;

        const count = mentionState.items.length;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            mentionState.index = (mentionState.index + 1) % count;
            highlightMention();

        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            mentionState.index = (mentionState.index - 1 + count) % count;
            highlightMention();

        } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            chooseMention(mentionState.items[mentionState.index]);

        } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeMentionMenu();
        }

    }, true);

    document.addEventListener("focusout", event => {
        if (mentionState && event.target === mentionState.input) {
            closeMentionMenu();
        }
    });

    window.addEventListener("resize", closeMentionMenu);
    window.addEventListener("scroll", closeMentionMenu, true);


    // =================================
    // POST CREATION
    // =================================


    // Posts / Replies / Likes numbers on the profile page
    function renderProfileStats() {
        const seen = new Set();
        const posts = firestorePosts.filter(
            post => post.authorId === currentAccount.id
        ).length;

        let likes = 0;

        timeline.querySelectorAll(".post-card").forEach(card => {
            const id = card.dataset.postId;
            if (!id || seen.has(id)) return;
            seen.add(id);

            if (likesByPost.get(id)?.has(currentAccount.id)) likes++;
        });

        const replies = Array.from(commentsById.values())
            .filter(comment => comment.authorId === currentAccount.id).length;

        const setStat = (name, value) => {
            document.querySelectorAll(`[data-stat="${name}"]`).forEach(element => {
                element.textContent = String(value);
            });
        };

        setStat("posts", posts);
        setStat("replies", replies);
        setStat("likes", likes);
    }

    function renderProfilePosts() {

        renderProfileStats();

        const profilePosts = document.querySelector(
            '[data-profile-panel="posts"]'
        );

        if (!profilePosts) return;

        profilePosts.innerHTML = "";

        const ownPosts = Array.from(
            timeline.querySelectorAll(".post-card")
        ).filter(post => post.dataset.authorId === currentAccount.id);

        if (ownPosts.length === 0) {
            profilePosts.innerHTML = `
            <div class="explore-empty-state">
                <div class="explore-empty-icon">
                    <i data-lucide="message-circle"></i>
                </div>
                <h3>Your little corner</h3>
                <p>Your posts will have a home here.</p>
            </div>
        `;

            refreshIcons();
            return;
        }

        ownPosts.forEach(post => {
            profilePosts.appendChild(post.cloneNode(true));
        });

        syncInteractions();
        refreshIcons();
    }


    // Profile "Replies" tab, built from Firestore comments
    function renderProfileReplies() {

        renderProfileStats();

        const repliesPanel = document.querySelector(
            '[data-profile-panel="replies"]'
        );

        if (!repliesPanel) return;

        repliesPanel.innerHTML = "";

        const ownReplies = Array.from(commentsById.values())
            .filter(comment =>
                comment.authorId === currentAccount.id &&
                getPost(comment.postId)
            )
            .reverse();

        if (ownReplies.length === 0) {
            repliesPanel.innerHTML = `
            <div class="explore-empty-state">
                <div class="explore-empty-icon">
                    <i data-lucide="message-circle"></i>
                </div>
                <h3>No replies yet</h3>
                <p>Your conversations will have a home here.</p>
            </div>
        `;

            refreshIcons();
            return;
        }

        ownReplies.forEach(comment => {
            const post = getPost(comment.postId);
            const parent = comment.parentId ? commentsById.get(comment.parentId) : null;
            const originalAuthorId = parent ? parent.authorId : post?.authorId;

            const item = document.createElement("div");
            item.className = "profile-reply-item";
            item.dataset.postId = comment.postId;
            item.dataset.commentId = comment.id;
            item.dataset.authorId = comment.authorId;

            const context = document.createElement("p");
            context.className = "profile-reply-context";
            context.textContent =
                `${currentAccount.name} replied to ${accounts[originalAuthorId]?.name || "a post"}`;

            const originalText = document.createElement("p");
            originalText.className = "profile-reply-original";
            appendTextWithMentions(originalText, (parent ? parent.content : post?.content) || "");

            const replyAuthor = document.createElement("strong");
            replyAuthor.className = "profile-reply-author";
            replyAuthor.textContent = currentAccount.name;

            const replyText = document.createElement("p");
            replyText.className = "profile-reply-text";
            appendTextWithMentions(replyText, comment.content);

            const viewButton = document.createElement("button");
            viewButton.type = "button";
            viewButton.className = "view-conversation-button";
            viewButton.textContent = "View conversation";

            item.append(context, originalText, replyAuthor, replyText, viewButton);
            repliesPanel.appendChild(item);
        });

        refreshIcons();
    }

    function renderProfileLikes() {

        renderProfileStats();

        const likesPanel = document.querySelector(
            '[data-profile-panel="likes"]'
        );

        if (!likesPanel) return;

        likesPanel.innerHTML = "";

        const likedPosts = Array.from(
            timeline.querySelectorAll(".post-card")
        ).filter(post => {
            const likers = likesByPost.get(post.dataset.postId);
            return likers?.has(currentAccount.id);
        });

        if (likedPosts.length === 0) {
            likesPanel.innerHTML = `
            <div class="explore-empty-state">
                <div class="explore-empty-icon">
                    <i data-lucide="heart"></i>
                </div>
                <h3>No likes yet</h3>
                <p>The posts you like will have a home here.</p>
            </div>
        `;

            refreshIcons();
            return;
        }

        likedPosts.forEach(post => {
            const likedPost = post.cloneNode(true);
            likedPost.dataset.likedPostId = post.dataset.postId;
            likesPanel.appendChild(likedPost);
        });

        syncInteractions();
        refreshIcons();
    }

    function createPost(content, account = currentAccount, firestoreId = null, createdAt = new Date()) {

        const post = document.createElement("article");
        post.className = "post-card";
        post.dataset.postId = firestoreId || `post-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        post.dataset.author = account.name;
        post.dataset.authorId = account.id;

        const avatar = document.createElement("div");
        avatar.className = `post-avatar avatar ${account.avatarClass}`;
        updateAvatarImage(avatar, account);

        const body = document.createElement("div");
        body.className = "post-body";

        const header = document.createElement("div");
        header.className = "post-header";

        const authorInfo = document.createElement("div");
        authorInfo.className = "post-author";

        const authorName = document.createElement("strong");
        authorName.textContent = account.name;

        const authorUsername = document.createElement("span");
        authorUsername.textContent = `@${account.username}`;

        const dot = document.createElement("span");
        dot.className = "post-dot";
        dot.textContent = "·";

        const time = document.createElement("time");
        time.dateTime = createdAt.toISOString();
        time.dataset.timestamp = String(createdAt.getTime());
        time.title = createdAt.toLocaleString();
        time.textContent = timeAgo(createdAt);

        authorInfo.append(authorName, authorUsername, dot, time);

        const more = document.createElement("button");
        more.className = "more-button";
        more.type = "button";
        more.setAttribute("aria-label", "More options");
        more.innerHTML = '<i data-lucide="more-horizontal"></i>';

        const postMenu = document.createElement("div");
        postMenu.className = "post-menu";
        postMenu.hidden = true;

        header.append(authorInfo, more, postMenu);

        const editPostOption = document.createElement("button");
        editPostOption.type = "button";
        editPostOption.className = "post-menu-option edit-post-option";
        editPostOption.innerHTML = '<i data-lucide="wand-sparkles"></i><span>Edit post</span>';

        const deletePostOption = document.createElement("button");
        deletePostOption.type = "button";
        deletePostOption.className = "post-menu-option delete-post-option";
        deletePostOption.innerHTML = '<i data-lucide="heart-crack"></i><span>Delete post</span>';

        postMenu.append(editPostOption, deletePostOption);

        if (account.id !== currentAccount.id) {
            more.hidden = true;
        }

        const text = document.createElement("p");
        text.className = "post-text";
        appendTextWithMentions(text, content);

        const readMoreButton = document.createElement("button");
        readMoreButton.className = "read-more-button";
        readMoreButton.textContent = "Read more";
        readMoreButton.hidden = true;

        readMoreButton.addEventListener("click", () => {
            const isExpanded = text.classList.toggle("expanded");

            readMoreButton.textContent = isExpanded ? "Show less" : "Read more";
        });

        const actions = document.createElement("div");
        actions.className = "post-actions";
        actions.innerHTML = `
            <button class="post-action comment-action" aria-label="Comments">
                <i data-lucide="message-circle"></i>
                <span>0</span>
            </button>

            <button class="post-action repost-action" aria-label="Repost">
                <i data-lucide="repeat-2"></i>
                <span>0</span>
            </button>

            <button class="post-action like-action" aria-label="Like">
                <i data-lucide="heart"></i>
                <span>0</span>
            </button>

            <button class="post-action bookmark-action" aria-label="Bookmark">
                <i data-lucide="bookmark"></i>
            </button>
        `;

        const commentsSection = document.createElement("div");
        commentsSection.className = "post-comments";
        commentsSection.hidden = true;

        const commentsList = document.createElement("div");
        commentsList.className = "post-comment-list";

        const commentForm = document.createElement("form");
        commentForm.className = "post-comment-form";
        commentForm.innerHTML = `
            <input
                type="text"
                class="comment-input"
                placeholder="Write a little reply..."
                maxlength="500"
                required
            >
            <button type="submit" class="comment-submit">Reply</button>
        `;

        commentsSection.append(commentsList, commentForm);
        body.append(header, text, readMoreButton, actions, commentsSection);
        post.append(avatar, body);

        requestAnimationFrame(() => {
            const isLong = text.scrollHeight > text.clientHeight + 1;
            readMoreButton.hidden = !isLong;
        });

        if (currentFeed === "together") {
            post.dataset.feed = "together";
        }

        if (!firestoreId) {
            timeline.prepend(post);
            renderProfilePosts();
            renderProfileReplies();
            syncInteractions();
            refreshIcons();
        }

        return post;
    }

    function getPost(postId) {
        return firestorePosts.find(post => post.id === postId) || null;
    }

    function renderFirestorePosts() {

        // Remember which threads are open so a new snapshot doesn't close them
        const openThreads = new Set(
            Array.from(timeline.querySelectorAll("[data-firestore-post='true']"))
                .filter(post => post.querySelector(".post-comments:not([hidden])"))
                .map(post => post.dataset.postId)
        );

        // Remove previously rendered Firestore posts
        timeline.querySelectorAll("[data-firestore-post='true']").forEach(post => {
            post.remove();
        });

        // Rebuild posts using the latest Firestore data
        firestorePosts.forEach(data => {
            const account = getAccountById(data.authorId);

            // Ignore posts with missing authors or content
            if (!account || !data.content) return;

            const post = createPost(data.content, account, data.id, toDate(data.createdAt));

            post.dataset.firestorePost = "true";

            if (data.feed === "together") {
                post.dataset.feed = "together";
            } else {
                delete post.dataset.feed;
            }

            if (openThreads.has(data.id)) {
                const section = post.querySelector(".post-comments");
                if (section) section.hidden = false;
            }

            timeline.append(post);
        });

        renderAllComments();
        renderProfilePosts();
        renderBookmarks();
        renderProfileReplies();
        renderProfileLikes();
        syncInteractions();
        refreshIcons();
    }


    // =================================
    // PUBLISH POST
    // =================================

    async function publishPost() {
        const content = postInput.value.trim();

        if (!content) return;

        publishButton.disabled = true;

        try {
            const postRef = doc(postsCollection);   // ID generated locally
            const batch = writeBatch(db);

            batch.set(postRef, {
                content: content,
                authorId: currentAccount.id,
                feed: currentFeed === "together" ? "together" : "for-you",
                createdAt: serverTimestamp()
            });

            extractMentionedIds(content).forEach(mentionedId => {
                if (mentionedId === currentAccount.id) return;

                batch.set(doc(db, "notifications", `mention_post_${postRef.id}_${mentionedId}`), {
                    type: "mention",
                    recipientId: mentionedId,
                    actorId: currentAccount.id,
                    postId: postRef.id,
                    commentId: null,
                    snippet: content,
                    read: false,
                    createdAt: serverTimestamp()
                });
            });

            await batch.commit();
            closeMentionMenu();

            postInput.value = "";
            postInput.style.height = "auto";
            postInput.blur();
            characterCount.textContent = "0 characters";
            characterCount.style.color = "";

        } catch (error) {
            console.error("Error publishing post:", error);
            alert("Your post could not be published. Please try again.");
        } finally {
            publishButton.disabled = postInput.value.trim().length === 0;
        }
    }

    publishButton.addEventListener("click", publishPost);

    postInput.addEventListener("keydown", event => {

        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            publishPost();
        }

    });


    // =================================
    // COMPOSER SHORTCUTS
    // =================================

    function focusComposer() {

        if (currentPage !== "home") {
            navigateTo("home", false);
        }

        document.getElementById("composer").scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

        setTimeout(() => postInput.focus(), 300);

    }

    document.getElementById("sidebarCompose")
        ?.addEventListener("click", focusComposer);

    document.getElementById("mobileCompose")
        ?.addEventListener("click", focusComposer);


    // =================================
    // SHARED POST INTERACTIONS (likes, reposts, bookmarks, comments toggle)
    // =================================

    // Like + its notification are written together in one atomic batch.
    // The like document ID is `${postId}_${uid}`, so a duplicate like is impossible.
    async function toggleLike(postId) {

        const uid = currentAccount.id;
        const liked = (likesByPost.get(postId) || new Set()).has(uid);
        const post = getPost(postId);
        const notifyAuthor = Boolean(post?.authorId && accounts[post.authorId] && post.authorId !== uid);

        const batch = writeBatch(db);
        const likeRef = doc(db, "likes", `${postId}_${uid}`);
        const notificationRef = doc(db, "notifications", `like_${postId}_${uid}`);

        if (liked) {
            batch.delete(likeRef);
            if (notifyAuthor) batch.delete(notificationRef);
        } else {
            batch.set(likeRef, {
                postId,
                userId: uid,
                createdAt: serverTimestamp()
            });

            if (notifyAuthor) {
                batch.set(notificationRef, {
                    type: "like",
                    recipientId: post.authorId,
                    actorId: uid,
                    postId,
                    commentId: null,
                    snippet: post.content || "",
                    read: false,
                    createdAt: serverTimestamp()
                });
            }
        }

        await batch.commit();
    }

    async function toggleSimple(collectionName, docId, isActive, data) {

        const ref = doc(db, collectionName, docId);

        if (isActive) {
            await deleteDoc(ref);
        } else {
            await setDoc(ref, { ...data, createdAt: serverTimestamp() });
        }
    }

    document.addEventListener("click", async event => {

        const button = event.target.closest(".post-action");

        if (!button) return;

        const post = button.closest(".post-card");

        if (!post) return;

        const postId = post.dataset.postId;

        if (!postId) return;

        const uid = currentAccount.id;

        // COMMENTS (UI only)
        if (button.classList.contains("comment-action")) {

            const commentsSection = post.querySelector(".post-comments");

            if (commentsSection) {

                commentsSection.hidden = !commentsSection.hidden;

                if (!commentsSection.hidden) {
                    commentsSection.querySelector(".comment-input")?.focus();
                }

            }

            return;
        }

        let kind = null;
        if (button.classList.contains("like-action")) kind = "like";
        else if (button.classList.contains("repost-action")) kind = "repost";
        else if (button.classList.contains("bookmark-action")) kind = "bookmark";

        if (!kind) return;

        // Ignore repeat clicks while the previous write is still in flight
        const actionKey = `${kind}:${postId}`;
        if (pendingActions.has(actionKey)) return;
        pendingActions.add(actionKey);

        try {

            if (kind === "like") {
                await toggleLike(postId);

            } else if (kind === "repost") {
                const active = (repostsByPost.get(postId) || new Set()).has(uid);
                await toggleSimple("reposts", `${postId}_${uid}`, active, {
                    postId,
                    userId: uid
                });

            } else if (kind === "bookmark") {
                const active = bookmarkedPostIds.has(postId);
                await toggleSimple("bookmarks", `${uid}_${postId}`, active, {
                    postId,
                    userId: uid
                });
            }

        } catch (error) {
            console.error(`Could not update ${kind}:`, error);
            alert("That didn't go through. Please try again.");
        } finally {
            pendingActions.delete(actionKey);
        }

    });

    // =================================
    // COMMENTS AND THREADED REPLIES
    // =================================

    const MAX_DEPTH = 2;

    function getDepth(comment) {
        let depth = 0;
        let el = comment.parentElement.closest(".post-comment");

        while (el) {
            depth++;
            el = el.parentElement.closest(".post-comment");
        }

        return depth;
    }

    function createThreadComment(
        content,
        commentId,
        author = currentAccount,
        replyingTo = null
    ) {

        const comment = document.createElement("div");
        comment.className = "post-comment";
        comment.dataset.commentId = commentId;
        comment.dataset.authorId = author.id;

        const commentAuthor = document.createElement("strong");
        commentAuthor.textContent = author.name;

        let replyingLabel = null;
        if (replyingTo) {
            replyingLabel = document.createElement("span");
            replyingLabel.className = "thread-replying-to";
            replyingLabel.textContent = `Replying to @${replyingTo}`;
        }

        const commentText = document.createElement("p");
        appendTextWithMentions(commentText, content);

        const replyButton = document.createElement("button");
        replyButton.type = "button";
        replyButton.className = "thread-reply-button";
        replyButton.textContent = "Reply";

        const replyForm = document.createElement("form");
        replyForm.className = "thread-reply-form";
        replyForm.hidden = true;

        replyForm.innerHTML = `
            <input
                type="text"
                class="comment-input"
                placeholder="Write a reply..."
                maxlength="500"
                required
            >
            <button type="submit" class="comment-submit">Reply</button>
        `;

        const replies = document.createElement("div");
        replies.className = "thread-replies";

        comment.append(
            commentAuthor,
            ...(replyingLabel ? [replyingLabel] : []),
            commentText,
            replyButton,
            replyForm,
            replies
        );

        return comment;
    }

    // Adds any comments from Firestore that this card doesn't show yet.
    // Idempotent: existing comment elements (and any text typed in them) are untouched.
    function renderCommentsInto(card) {

        const postId = card.dataset.postId;
        const list = card.querySelector(".post-comment-list");

        if (!postId || !list) return;

        const comments = Array.from(commentsById.values())
            .filter(comment => comment.postId === postId);

        comments.forEach(comment => {

            const alreadyShown = card.querySelector(
                `.post-comment[data-comment-id="${CSS.escape(comment.id)}"]`
            );
            if (alreadyShown) return;

            const author = accounts[comment.authorId];
            if (!author) return;

            if (!comment.parentId) {
                list.appendChild(
                    createThreadComment(comment.content, comment.id, author)
                );
                return;
            }

            const parentEl = card.querySelector(
                `.post-comment[data-comment-id="${CSS.escape(comment.parentId)}"]`
            );
            if (!parentEl) return;

            const tooDeep = getDepth(parentEl) >= MAX_DEPTH;
            const container = tooDeep
                ? parentEl.parentElement
                : parentEl.querySelector(":scope > .thread-replies");

            if (!container) return;

            const parentAuthor = accounts[parentEl.dataset.authorId];

            container.appendChild(
                createThreadComment(
                    comment.content,
                    comment.id,
                    author,
                    tooDeep ? parentAuthor?.username : null
                )
            );
        });

        const count = card.querySelector(".comment-action span");
        if (count) {
            count.textContent = String(comments.length);
        }
    }

    function renderAllComments() {
        document.querySelectorAll(".post-card").forEach(renderCommentsInto);
    }

    // Hide the main comment form while any nested reply form is open
    function syncCommentForms(post) {

        if (!post) return;

        const anyReplyOpen = post.querySelector(".thread-reply-form:not([hidden])");

        post.classList.toggle("is-replying", Boolean(anyReplyOpen));
        const commentForm = post.querySelector(".post-comment-form");
        if (commentForm) {
            commentForm.hidden = Boolean(anyReplyOpen);
        }

    }

    // Toggle a comment's reply form
    document.addEventListener("click", event => {

        const button = event.target.closest(".thread-reply-button");

        if (!button) return;

        const comment = button.closest(".post-comment");
        const post = button.closest(".post-card");
        const form = comment?.querySelector(":scope > .thread-reply-form");

        if (!form) return;

        const willOpen = form.hidden;

        // Close every other open reply form in this post
        post?.querySelectorAll(".thread-reply-form").forEach(other => {
            other.hidden = true;
        });

        form.hidden = !willOpen;

        syncCommentForms(post);

        if (!form.hidden) {
            form.querySelector(".comment-input")?.focus();
        }

    });

    // View the full conversation for a profile reply
    document.addEventListener("click", event => {

        const button = event.target.closest(".view-conversation-button");

        if (!button) return;

        const item = button.closest(".profile-reply-item");
        const postId = item?.dataset.postId;
        const commentId = item?.dataset.commentId;

        if (!postId) return;

        // Go to Home without the automatic scroll-to-top
        navigateTo("home", false);

        // Always target the original post in the timeline (not profile/bookmark clones)
        const originalPost = Array.from(
            timeline.querySelectorAll(".post-card")
        ).find(p => p.dataset.postId === postId);

        if (!originalPost) return;

        // Open the comment thread
        const commentsSection = originalPost.querySelector(".post-comments");
        if (commentsSection) commentsSection.hidden = false;

        // Find your reply inside the thread
        const targetComment = Array.from(
            originalPost.querySelectorAll(".post-comment")
        ).find(c => c.dataset.commentId === commentId);

        const scrollTarget = targetComment || originalPost;

        scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });

        // Briefly highlight your reply
        if (targetComment) {
            targetComment.classList.add("reply-highlight");
            setTimeout(() => targetComment.classList.remove("reply-highlight"), 2200);
        }

    });

    // Save a comment (or reply) and its notification together, atomically.
    async function saveComment({ postId, content, parentId = null, recipientId }) {

        const uid = currentAccount.id;
        const commentRef = doc(commentsCollection);   // auto ID generated locally
        const batch = writeBatch(db);

        batch.set(commentRef, {
            postId,
            authorId: uid,
            content,
            parentId,
            createdAt: serverTimestamp()
        });

        const notifiedIds = new Set();

        // Only notify real, different members of our two-person space
        if (recipientId && accounts[recipientId] && recipientId !== uid) {
            const type = parentId ? "reply" : "comment";

            batch.set(doc(db, "notifications", `${type}_${commentRef.id}`), {
                type,
                recipientId,
                actorId: uid,
                postId,
                commentId: commentRef.id,
                snippet: content,
                read: false,
                createdAt: serverTimestamp()
            });

            notifiedIds.add(recipientId);
        }

        // @mentions (skip anyone already being notified about this comment)
        extractMentionedIds(content).forEach(mentionedId => {
            if (mentionedId === uid || notifiedIds.has(mentionedId)) return;

            batch.set(doc(db, "notifications", `mention_comment_${commentRef.id}_${mentionedId}`), {
                type: "mention",
                recipientId: mentionedId,
                actorId: uid,
                postId,
                commentId: commentRef.id,
                snippet: content,
                read: false,
                createdAt: serverTimestamp()
            });
        });

        await batch.commit();
    }

    // Submit a top-level comment OR a threaded reply
    document.addEventListener("submit", async event => {

        const topForm = event.target.closest(".post-comment-form");
        const replyForm = event.target.closest(".thread-reply-form");
        const form = topForm || replyForm;

        if (!form) return;

        event.preventDefault();

        const post = form.closest(".post-card");
        const postId = post?.dataset.postId;
        const input = form.querySelector(".comment-input");
        const submitButton = form.querySelector(".comment-submit");
        const content = input.value.trim();

        if (!content || !postId) return;
        if (submitButton?.disabled) return;

        let parentId = null;
        let recipientId = getPost(postId)?.authorId || post.dataset.authorId;

        if (replyForm) {
            const parentEl = form.closest(".post-comment");
            parentId = parentEl?.dataset.commentId;
            if (!parentId) return;

            recipientId =
                commentsById.get(parentId)?.authorId || parentEl.dataset.authorId;
        }

        if (submitButton) submitButton.disabled = true;

        try {
            await saveComment({ postId, content, parentId, recipientId });

            input.value = "";

            if (replyForm) {
                form.hidden = true;
                syncCommentForms(post);
            }

            const commentsSection = post.querySelector(".post-comments");
            if (commentsSection) commentsSection.hidden = false;

        } catch (error) {
            console.error("Error saving comment:", error);
            alert("Your reply could not be saved. Please try again.");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }

    });

    // =================================
    // EDIT PROFILE
    // =================================

    const editProfileButton = document.querySelector(".profile-edit-button");
    const editProfileModal = document.getElementById("editProfileModal");
    const closeProfileModal = document.getElementById("closeProfileModal");
    const cancelProfileEdit = document.getElementById("cancelProfileEdit");
    const editProfileForm = document.getElementById("editProfileForm");
    const editDisplayName = document.getElementById("editDisplayName");
    const editProfilePicture = document.getElementById("editProfilePicture");
    const selectedPictureName = document.getElementById("selectedPictureName");
    const profilePicturePreview = document.getElementById("profilePicturePreview");
    const editUsername = document.getElementById("editUsername");
    const editBio = document.getElementById("editBio");

    const editCoverPicture = document.getElementById("editCoverPicture");
    const selectedCoverName = document.getElementById("selectedCoverName");
    const coverPicturePreview = document.getElementById("coverPicturePreview");
    const removeCoverPhoto = document.getElementById("removeCoverPhoto");

    let previewUrl = null;
    let coverPreviewUrl = null;
    let pendingCoverRemoval = false;

    function resetCoverPicker() {
        if (coverPreviewUrl) {
            URL.revokeObjectURL(coverPreviewUrl);
            coverPreviewUrl = null;
        }
        pendingCoverRemoval = false;

        if (editCoverPicture) editCoverPicture.value = "";
        if (selectedCoverName) selectedCoverName.textContent = "No cover selected";
        if (coverPicturePreview) {
            coverPicturePreview.hidden = true;
            coverPicturePreview.removeAttribute("src");
        }
        if (removeCoverPhoto) {
            removeCoverPhoto.hidden = !currentAccount.coverImage;
        }
    }

    editCoverPicture?.addEventListener("change", () => {
        const file = editCoverPicture.files[0];

        if (coverPreviewUrl) {
            URL.revokeObjectURL(coverPreviewUrl);
            coverPreviewUrl = null;
        }

        pendingCoverRemoval = false;

        if (!file) {
            selectedCoverName.textContent = "No cover selected";
            coverPicturePreview.hidden = true;
            coverPicturePreview.removeAttribute("src");
            if (removeCoverPhoto) removeCoverPhoto.hidden = !currentAccount.coverImage;
            return;
        }

        selectedCoverName.textContent = file.name;
        coverPreviewUrl = URL.createObjectURL(file);
        coverPicturePreview.src = coverPreviewUrl;
        coverPicturePreview.hidden = false;
        if (removeCoverPhoto) removeCoverPhoto.hidden = true;
    });

    removeCoverPhoto?.addEventListener("click", () => {
        resetCoverPicker();
        pendingCoverRemoval = true;
        selectedCoverName.textContent = "Cover will be removed";
        removeCoverPhoto.hidden = true;
    });

    editProfilePicture?.addEventListener("change", () => {
        const file = editProfilePicture.files[0];

        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            previewUrl = null;
        }

        if (!file) {
            selectedPictureName.textContent = "No picture selected";
            profilePicturePreview.hidden = true;
            profilePicturePreview.removeAttribute("src");
            return;
        }

        selectedPictureName.textContent = file.name;

        previewUrl = URL.createObjectURL(file);
        profilePicturePreview.src = previewUrl;
        profilePicturePreview.hidden = false;
    });

    function openProfileModal() {

        editDisplayName.value = currentAccount.name;
        editUsername.value = currentAccount.username;
        editBio.value = currentAccount.bio;
        resetCoverPicker();

        editProfileModal.hidden = false;
        editDisplayName.focus();

    }


    function closeProfileEditor() {
        editProfileModal.hidden = true;
    }

    editProfileButton?.addEventListener("click", openProfileModal);

    closeProfileModal?.addEventListener("click", closeProfileEditor);

    cancelProfileEdit?.addEventListener("click", closeProfileEditor);

    editProfileModal?.addEventListener("click", event => {
        if (event.target === editProfileModal) {
            closeProfileEditor();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !editProfileModal.hidden) {
            closeProfileEditor();
        }
    });

    function compressProfileImage(file) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            const objectUrl = URL.createObjectURL(file);

            image.onload = () => {
                URL.revokeObjectURL(objectUrl);

                const maxSize = 256;
                const scale = Math.min(
                    maxSize / image.width,
                    maxSize / image.height,
                    1
                );

                const canvas = document.createElement("canvas");
                canvas.width = Math.round(image.width * scale);
                canvas.height = Math.round(image.height * scale);

                const context = canvas.getContext("2d");
                context.drawImage(image, 0, 0, canvas.width, canvas.height);

                resolve(canvas.toDataURL("image/jpeg", 0.75));
            };

            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("Could not process this profile picture."));
            };

            image.src = objectUrl;
        });
    }

    // Center-crops to a 3:1 banner and compresses it so it fits comfortably in Firestore
    function compressCoverImage(file) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            const objectUrl = URL.createObjectURL(file);

            image.onload = () => {
                URL.revokeObjectURL(objectUrl);

                const ratio = 3;
                let sw = image.width;
                let sh = image.height;
                let sx = 0;
                let sy = 0;

                if (sw / sh > ratio) {
                    const cropWidth = sh * ratio;
                    sx = (sw - cropWidth) / 2;
                    sw = cropWidth;
                } else {
                    const cropHeight = sw / ratio;
                    sy = (sh - cropHeight) / 2;
                    sh = cropHeight;
                }

                const outWidth = Math.min(1200, Math.round(sw));
                const outHeight = Math.round(outWidth / ratio);

                const canvas = document.createElement("canvas");
                canvas.width = outWidth;
                canvas.height = outHeight;
                canvas.getContext("2d").drawImage(
                    image, sx, sy, sw, sh, 0, 0, outWidth, outHeight
                );

                let quality = 0.8;
                let dataUrl = canvas.toDataURL("image/jpeg", quality);

                while (dataUrl.length > 600000 && quality > 0.4) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL("image/jpeg", quality);
                }

                if (dataUrl.length > 900000) {
                    reject(new Error("This cover photo is too large. Try a smaller one."));
                    return;
                }

                resolve(dataUrl);
            };

            image.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("Could not process this cover photo."));
            };

            image.src = objectUrl;
        });
    }

    editProfileForm?.addEventListener("submit", async event => {

        event.preventDefault();

        const name = editDisplayName.value.trim();
        const username = editUsername.value
            .trim()
            .replace(/^@/, "")
            .replace(/[^A-Za-z0-9_]/g, "");
        const bio = editBio.value.trim();

        if (!name) return;

        if (!username) {
            alert("Usernames can only use letters, numbers and underscores.");
            return;
        }

        const usernameTaken = Object.values(accounts).some(account =>
            account.id !== currentAccount.id &&
            account.username.toLowerCase() === username.toLowerCase()
        );

        if (usernameTaken) {
            alert("That username is already used by the other account.");
            return;
        }

        const imageFile = editProfilePicture.files[0];
        const coverFile = editCoverPicture?.files[0];

        try {
            if (imageFile) {
                currentAccount.avatarImage = await compressProfileImage(imageFile);
            }

            if (coverFile) {
                currentAccount.coverImage = await compressCoverImage(coverFile);
            } else if (pendingCoverRemoval) {
                currentAccount.coverImage = "";
            }
        } catch (error) {
            console.error("Image processing failed:", error);
            alert(error.message || "That picture could not be processed.");
            return;
        }

        // Save changes to the currently selected account
        currentAccount.name = name;
        currentAccount.username = username;
        currentAccount.bio = bio;

        const savedProfiles = JSON.parse(
            localStorage.getItem("ols-profiles") || "{}"
        );

        savedProfiles[currentAccount.id] = {
            name: currentAccount.name,
            username: currentAccount.username,
            bio: currentAccount.bio,
            avatarImage: currentAccount.avatarImage || ""
        };

        localStorage.setItem(
            "ols-profiles",
            JSON.stringify(savedProfiles)
        );

        // Refresh the displayed profile
        const profileDisplayName = document.getElementById("profileDisplayName");
        const profileUsername = document.getElementById("profileUsername");
        const profileBio = document.getElementById("profileBio");

        if (profileDisplayName) profileDisplayName.textContent = name;
        if (profileUsername) profileUsername.textContent = `@${username}`;
        if (profileBio) profileBio.textContent = bio;

        // Save profile changes to Firestore
        try {
            await setDoc(doc(db, "users", currentAccount.id), {
                name: name,
                username: username,
                bio: bio,
                avatarImage: currentAccount.avatarImage || "",
                coverImage: currentAccount.coverImage || "",
                updatedAt: serverTimestamp()
            }, { merge: true });

            console.log("Profile synced to Firestore!");

        } catch (error) {
            console.error("Error syncing profile:", error);
            alert("Your profile was saved on this device, but could not sync to the cloud.");
        }

        // Update the sidebar account information
        setAccount(currentAccount.id);

        closeProfileEditor();

    });


    // =================================
    // PROFILE TABS
    // =================================

    const profileTabs = document.querySelectorAll("[data-profile-tab]");
    const profilePanels = document.querySelectorAll("[data-profile-panel]");

    profileTabs.forEach(tab => {

        tab.addEventListener("click", () => {

            const selectedTab = tab.dataset.profileTab;
            // Close all open comment sections when switching tabs
            profilePanels.forEach(panel => {
                panel.querySelectorAll(".post-comments").forEach(section => {
                    section.hidden = true;
                });
            });
            // Update active tab
            profileTabs.forEach(item => {
                item.classList.toggle("active", item === tab);
            });

            // Show selected content
            profilePanels.forEach(panel => {
                const isSelected = panel.dataset.profilePanel === selectedTab;

                panel.hidden = !isSelected;
                panel.classList.toggle("active", isSelected);
            });

        });

    });

    const editPostModal = document.getElementById("editPostModal");
    const editPostForm = document.getElementById("editPostForm");
    const editPostContent = document.getElementById("editPostContent");

    const deletePostModal = document.getElementById("deletePostModal");
    const closeDeletePostModalButton = document.getElementById("closeDeletePostModal");
    const cancelPostDelete = document.getElementById("cancelPostDelete");
    const confirmPostDelete = document.getElementById("confirmPostDelete");

    let pendingDeletePostId = null;

    function closeDeletePostModal() {
        deletePostModal.hidden = true;
        pendingDeletePostId = null;
    }

    closeDeletePostModalButton.addEventListener("click", closeDeletePostModal);
    cancelPostDelete.addEventListener("click", closeDeletePostModal);

    confirmPostDelete.addEventListener("click", async () => {
        const postId = pendingDeletePostId;

        if (!postId || !auth.currentUser) return;

        const post = getPost(postId);

        if (!post || post.authorId !== auth.currentUser.uid) {
            alert("You can only delete your own posts.");
            closeDeletePostModal();
            return;
        }

        confirmPostDelete.disabled = true;
        confirmPostDelete.textContent = "Deleting...";

        try {
            await deletePostAndRelatedData(postId);

            closeDeletePostModal();

        } catch (error) {
            console.error("Error deleting post and related data:", error);
            alert("We couldn't completely delete this post. Please try again.");
        } finally {
            confirmPostDelete.disabled = false;
            confirmPostDelete.textContent = "Delete post";
        }
    });

    editPostForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const postId = editPostModal.dataset.postId;
        const content = editPostContent.value.trim();

        if (!postId || !content || !auth.currentUser) return;

        const saveButton = document.getElementById("savePostEdit");
        saveButton.disabled = true;
        saveButton.textContent = "Saving...";

        try {
            await updateDoc(doc(db, "posts", postId), {
                content,
                editedAt: serverTimestamp()
            });

            editPostModal.hidden = true;
            delete editPostModal.dataset.postId;
            editPostForm.reset();

        } catch (error) {
            console.error("Error editing post:", error);
            alert("We couldn't save your changes. Please try again.");
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = "Save changes";
        }
    });

    function closeEditPostModal() {
        editPostModal.hidden = true;
        delete editPostModal.dataset.postId;
        editPostForm.reset();
    }

    document.getElementById("closeEditPostModal")
        .addEventListener("click", closeEditPostModal);

    document.getElementById("cancelPostEdit")
        .addEventListener("click", closeEditPostModal);


    document.addEventListener("click", async (event) => {
        const moreButton = event.target.closest(".more-button");

        if (moreButton) {
            const post = moreButton.closest(".post-card");
            const menu = post?.querySelector(".post-menu");

            if (!menu) return;

            document.querySelectorAll(".post-menu").forEach(otherMenu => {
                if (otherMenu !== menu) {
                    otherMenu.hidden = true;
                }
            });

            menu.hidden = !menu.hidden;
            return;
        }

        // EDIT POST
        const editButton = event.target.closest(".edit-post-option");

        if (editButton) {
            const post = editButton.closest(".post-card");

            if (!post || post.dataset.authorId !== auth.currentUser?.uid) {
                return;
            }

            const postData = getPost(post.dataset.postId);
            if (!postData) return;

            editPostContent.value = postData.content || "";
            editPostModal.dataset.postId = post.dataset.postId;
            editPostModal.hidden = false;

            document.querySelectorAll(".post-menu").forEach(menu => {
                menu.hidden = true;
            });

            if (window.lucide) lucide.createIcons();
            return;
        }

        // DELETE POST
        const deleteButton = event.target.closest(".delete-post-option");

        if (deleteButton) {
            const post = deleteButton.closest(".post-card");

            if (!post || post.dataset.authorId !== auth.currentUser?.uid) {
                return;
            }

            const postId = post.dataset.postId;

            if (!postId) return;

            pendingDeletePostId = postId;
            deletePostModal.hidden = false;

            document.querySelectorAll(".post-menu").forEach(menu => {
                menu.hidden = true;
            });

            if (window.lucide) lucide.createIcons();
            return;
        }

        if (!event.target.closest(".post-menu")) {
            document.querySelectorAll(".post-menu").forEach(menu => {
                menu.hidden = true;
            });
        }
    });


    // =================================
    // INITIALIZE
    // =================================

    // Give existing posts unique IDs
    timeline.querySelectorAll(".post-card").forEach((post, index) => {

        if (!post.dataset.postId) {
            post.dataset.postId = `existing-post-${index + 1}`;
        }

        if (!post.dataset.author) {
            post.dataset.author = "You";
        }

        if (!post.dataset.authorId) {
            post.dataset.authorId = "you";
        }

    });

    setAccount(currentAccount.id);
    syncInteractions();
    renderNotifications();
    navigateTo("home");
    refreshIcons();

    setInterval(refreshTimestamps, 30000);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") refreshTimestamps();
    });

});