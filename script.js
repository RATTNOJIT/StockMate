const { supabaseUrl, supabasePublishableKey } = window.STOCKMATE_CONFIG || {};
const passwordInput = document.getElementById("password");
const togglePassword = document.getElementById("togglePassword");
const loginForm = document.getElementById("loginForm");
const forgotForm = document.getElementById("forgotPasswordForm");
const resetForm = document.getElementById("resetPasswordForm");
const message = document.getElementById("message");
const forgotMessage = document.getElementById("forgotMessage");
const resetMessage = document.getElementById("resetMessage");
const emailInput = document.getElementById("email");
const forgotEmail = document.getElementById("forgotEmail");
const loginButton = loginForm?.querySelector(".login-btn");
const forgotButton = document.getElementById("forgotSubmit");
const resetButton = document.getElementById("resetPasswordButton");
const loginHeading = document.getElementById("loginHeading");
const userSideLink = document.querySelector(".user-side-link");
const loginBottom = document.querySelector(".login-bottom");
const forgotLink = document.querySelector(".forgot:not(.back-to-signin)");
const backToSignin = document.querySelector(".back-to-signin");

function hideAllAuthForms() {
    if (loginForm) loginForm.hidden = true;
    if (forgotForm) forgotForm.hidden = true;
    if (resetForm) resetForm.hidden = true;
    if (loginHeading) loginHeading.hidden = true;
    if (userSideLink) userSideLink.hidden = true;
    if (loginBottom) loginBottom.hidden = true;
}
function showLoginForm() {
    hideAllAuthForms();
    if (loginForm) loginForm.hidden = false;
    if (loginHeading) loginHeading.hidden = false;
    if (userSideLink) userSideLink.hidden = false;
    if (loginBottom) loginBottom.hidden = false;
}
function showForgotForm() {
    hideAllAuthForms();
    if (forgotForm) forgotForm.hidden = false;
    forgotEmail.value = emailInput.value.trim();
    forgotMessage.textContent = "";
    forgotEmail.focus();
}
function showRecoveryForm() {
    hideAllAuthForms();
    if (resetForm) resetForm.hidden = false;
}

if (!window.supabase || !supabaseUrl || !supabasePublishableKey) {
    if (message) message.textContent = "Login service is not configured. Check the Supabase connection and try again.";
} else {
    const supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);

    function bindPasswordToggle(inputId, buttonId) {
        const input = document.getElementById(inputId);
        const button = document.getElementById(buttonId);
        button?.addEventListener("click", () => {
            const showing = input.type === "password";
            input.type = showing ? "text" : "password";
            button.textContent = showing ? "Hide" : "Show";
        });
    }
    bindPasswordToggle("newPassword", "toggleNewPassword");
    bindPasswordToggle("confirmPassword", "toggleConfirmPassword");
    togglePassword?.addEventListener("click", () => {
        const isPassword = passwordInput.type === "password";
        passwordInput.type = isPassword ? "text" : "password";
        togglePassword.textContent = isPassword ? "Hide" : "Show";
    });

    forgotLink?.addEventListener("click", event => {
        event.preventDefault();
        showForgotForm();
    });
    backToSignin?.addEventListener("click", event => {
        event.preventDefault();
        showLoginForm();
    });

    forgotForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const email = forgotEmail.value.trim();
        if (!email || !forgotEmail.checkValidity()) {
            forgotMessage.style.color = "#dc3545";
            forgotMessage.textContent = "Enter a valid admin email address.";
            forgotEmail.focus();
            return;
        }
        forgotButton.disabled = true;
        forgotButton.textContent = "Sending…";
        forgotMessage.textContent = "";
        try {
            const redirectTo = new URL("index.html", window.location.href).href;
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
            if (error) throw error;
            forgotMessage.style.color = "#168b68";
            forgotMessage.textContent = "If this email belongs to an account, a password reset link has been sent.";
        } catch (error) {
            forgotMessage.style.color = "#dc3545";
            forgotMessage.textContent = error?.message || "Could not send the reset link. Please try again.";
        } finally {
            forgotButton.disabled = false;
            forgotButton.innerHTML = 'Send Reset Link <span>→</span>';
        }
    });

    supabaseClient.auth.onAuthStateChange(event => {
        if (event === "PASSWORD_RECOVERY") showRecoveryForm();
    });

    resetForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const newPassword = document.getElementById("newPassword").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        if (newPassword.length < 8) {
            resetMessage.style.color = "#dc3545";
            resetMessage.textContent = "Use at least 8 characters for your new password.";
            return;
        }
        if (newPassword !== confirmPassword) {
            resetMessage.style.color = "#dc3545";
            resetMessage.textContent = "The passwords do not match.";
            return;
        }
        resetButton.disabled = true;
        resetButton.textContent = "Saving…";
        resetMessage.textContent = "";
        try {
            const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
            if (error) throw error;
            await supabaseClient.auth.signOut();
            showLoginForm();
            resetForm.reset();
            message.style.color = "#168b68";
            message.textContent = "Password updated. Sign in with your new password.";
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
            resetMessage.style.color = "#dc3545";
            resetMessage.textContent = error?.message || "Could not update the password. Request a new reset link and try again.";
        } finally {
            resetButton.disabled = false;
            resetButton.innerHTML = 'Save New Password <span>→</span>';
        }
    });

    loginForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        loginButton.disabled = true;
        loginButton.innerHTML = "Signing In...";
        message.textContent = "";
        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            const { data: admin, error: adminError } = await supabaseClient
                .from("admins").select("id").eq("id", data.user.id).maybeSingle();
            if (adminError) throw adminError;
            if (!admin) {
                await supabaseClient.auth.signOut();
                throw new Error("This account is not authorized as an admin.");
            }
            message.style.color = "#168b68";
            message.textContent = "Login successful! Redirecting...";
            window.location.href = "dashboard.html";
        } catch (error) {
            message.style.color = "#dc3545";
            message.textContent = error?.message || "Unable to sign in. Please try again.";
            loginButton.disabled = false;
            loginButton.innerHTML = 'Sign In <span>→</span>';
        }
    });
}