#!/usr/bin/env bash
#
# harden-server.sh — One-shot hardening for a fresh Ubuntu 22.04/24.04 Linode.
# Run as root. Interactive where it needs input, automated everywhere else.
# Re-run safe: completed steps are skipped automatically.
#
set -uo pipefail

# ─── Colors / helpers ─────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { printf "${GREEN}[INFO]${NC}  %s\n" "$*"; }
warn()  { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
skip()  { printf "${CYAN}[SKIP]${NC}  %s\n" "$*"; }
error() { printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; }
fatal() { error "$@"; exit 1; }

# ─── Checkpoint helpers ───────────────────────────────────────────────────────

STATE_DIR="/var/lib/harden-server"
mkdir -p "$STATE_DIR"

step_done()  { [[ -f "$STATE_DIR/$1" ]]; }
mark_done()  { touch "$STATE_DIR/$1"; }

# Save a value so it survives re-runs (e.g. the chosen username)
save_var() { echo "$2" > "$STATE_DIR/var_$1"; }
load_var() { [[ -f "$STATE_DIR/var_$1" ]] && cat "$STATE_DIR/var_$1" || echo ""; }

# ─── 1. Preflight checks ─────────────────────────────────────────────────────

[[ $EUID -eq 0 ]] || fatal "This script must be run as root."

if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    [[ "$ID" == "ubuntu" ]] || fatal "This script targets Ubuntu. Detected: $ID"
    info "Detected $PRETTY_NAME"
else
    fatal "/etc/os-release not found — cannot confirm Ubuntu."
fi

echo ""
warn "This script will harden this server. Changes include:"
echo "  - Creating a non-root deploy user"
echo "  - Disabling root SSH login and password auth"
echo "  - Enabling UFW firewall (SSH only)"
echo "  - Installing fail2ban"
echo "  - Enabling automatic security updates"
echo "  - Applying kernel/network sysctl tweaks"
echo ""
if step_done "complete"; then
    info "All steps already completed. Nothing to do."
    exit 0
fi
if ls "$STATE_DIR"/step_* &>/dev/null; then
    warn "Previous run detected — completed steps will be skipped."
fi
read -rp "Proceed? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { info "Aborted."; exit 0; }

# ─── 2. System update ────────────────────────────────────────────────────────

if step_done "step_update"; then
    skip "System update (already done)"
else
    info "Updating package lists and upgrading installed packages..."
    if apt update && apt upgrade -y; then
        mark_done "step_update"
    else
        fatal "System update failed. Re-run the script to retry."
    fi
fi

if step_done "step_essentials"; then
    skip "Install essentials (already done)"
else
    info "Installing essentials..."
    if apt install -y ufw fail2ban unattended-upgrades; then
        mark_done "step_essentials"
    else
        fatal "Package install failed. Re-run the script to retry."
    fi
fi

# ─── 3. Create non-root deploy user ──────────────────────────────────────────

DEPLOY_USER="$(load_var deploy_user)"
if [[ -z "$DEPLOY_USER" ]]; then
    read -rp "Username for the deploy user [deploy]: " DEPLOY_USER
    DEPLOY_USER="${DEPLOY_USER:-deploy}"
    save_var deploy_user "$DEPLOY_USER"
else
    info "Using previously chosen username: $DEPLOY_USER"
fi

if step_done "step_user"; then
    skip "Create deploy user (already done)"
else
    if id "$DEPLOY_USER" &>/dev/null; then
        info "User '$DEPLOY_USER' already exists — skipping creation."
    else
        info "Creating user '$DEPLOY_USER'..."
        adduser --disabled-password --gecos "" "$DEPLOY_USER"
    fi

    usermod -aG sudo "$DEPLOY_USER"

    # Let the deploy user sudo without a password (they have no password anyway)
    echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/$DEPLOY_USER"
    chmod 440 "/etc/sudoers.d/$DEPLOY_USER"

    # Set up SSH key for the deploy user
    DEPLOY_HOME=$(eval echo "~$DEPLOY_USER")
    DEPLOY_SSH_DIR="$DEPLOY_HOME/.ssh"
    mkdir -p "$DEPLOY_SSH_DIR"

    if [[ -s /root/.ssh/authorized_keys ]]; then
        cp /root/.ssh/authorized_keys "$DEPLOY_SSH_DIR/authorized_keys"
        info "Copied root's authorized_keys to $DEPLOY_USER."
    else
        warn "No usable root SSH keys found."
        echo "Paste the public SSH key for $DEPLOY_USER (one line):"
        read -r SSH_KEY
        echo "$SSH_KEY" > "$DEPLOY_SSH_DIR/authorized_keys"
    fi

    chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_SSH_DIR"
    chmod 700 "$DEPLOY_SSH_DIR"
    chmod 600 "$DEPLOY_SSH_DIR/authorized_keys"

    # SSH refuses keys if the home directory is group/other-writable
    chmod 750 "$DEPLOY_HOME"
    chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME"

    # Sanity check: authorized_keys must not be empty
    if [[ ! -s "$DEPLOY_SSH_DIR/authorized_keys" ]]; then
        fatal "authorized_keys is empty — cannot proceed without an SSH key."
    fi

    # Verify sudo works for the new user
    if sudo -u "$DEPLOY_USER" sudo -n true 2>/dev/null; then
        info "Verified: '$DEPLOY_USER' can sudo."
        mark_done "step_user"
    else
        fatal "'$DEPLOY_USER' cannot sudo — aborting before SSH lockout."
    fi
fi

# ─── 4. SSH hardening ────────────────────────────────────────────────────────

if step_done "step_ssh"; then
    skip "SSH hardening (already done)"
else
    info "Hardening SSH configuration..."
    cat > /etc/ssh/sshd_config.d/hardening.conf <<EOF
# Server hardening — generated by harden-server.sh
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
X11Forwarding no
MaxAuthTries 3
AllowUsers $DEPLOY_USER
EOF

    # Ensure privilege separation directory exists (missing on some fresh installs)
    mkdir -p /run/sshd

    # Validate config before restarting
    if ! sshd -t; then
        fatal "sshd config test failed — not restarting. Fix /etc/ssh/sshd_config.d/hardening.conf and re-run."
    fi
    # Ubuntu uses 'ssh', not 'sshd'
    systemctl enable ssh
    if ! systemctl restart ssh; then
        fatal "Failed to restart ssh. Re-run the script to retry."
    fi
    if ! systemctl is-active --quiet ssh; then
        fatal "ssh service is not running after restart. Re-run the script to retry."
    fi
    info "ssh enabled and restarted with hardened config."
    mark_done "step_ssh"
fi

# ─── 5. Firewall (UFW) ───────────────────────────────────────────────────────

if step_done "step_ufw"; then
    skip "UFW firewall (already done)"
else
    info "Configuring UFW firewall..."
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw --force enable
    info "UFW enabled — only SSH (port 22) is open."
    mark_done "step_ufw"
fi

# ─── 6. Fail2ban ─────────────────────────────────────────────────────────────

if step_done "step_fail2ban"; then
    skip "Fail2ban (already done)"
else
    info "Configuring fail2ban..."
    cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port    = ssh
filter  = sshd
logpath = /var/log/auth.log
EOF

    systemctl enable fail2ban
    systemctl restart fail2ban
    info "fail2ban enabled with SSH jail (5 retries, 10-min ban)."
    mark_done "step_fail2ban"
fi

# ─── 7. Automatic security updates ───────────────────────────────────────────

if step_done "step_unattended"; then
    skip "Unattended upgrades (already done)"
else
    info "Enabling unattended security upgrades..."
    cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

    cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

    info "Unattended-upgrades configured for security patches."
    mark_done "step_unattended"
fi

# ─── 8. Kernel / network hardening (sysctl) ──────────────────────────────────

if step_done "step_sysctl"; then
    skip "Sysctl hardening (already done)"
else
    DISABLE_IPV6="$(load_var disable_ipv6)"
    if [[ -z "$DISABLE_IPV6" ]]; then
        echo ""
        read -rp "Disable IPv6? [y/N] " DISABLE_IPV6
        DISABLE_IPV6="${DISABLE_IPV6:-N}"
        save_var disable_ipv6 "$DISABLE_IPV6"
    fi

    info "Applying sysctl network hardening..."
    cat > /etc/sysctl.d/99-hardening.conf <<EOF
# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0

# Don't send ICMP redirects
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# Disable source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0

# SYN flood protection
net.ipv4.tcp_syncookies = 1

# Log martian packets
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1
EOF

    if [[ "$DISABLE_IPV6" =~ ^[Yy]$ ]]; then
        cat >> /etc/sysctl.d/99-hardening.conf <<'EOF'

# Disable IPv6
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
net.ipv6.conf.lo.disable_ipv6 = 1
EOF
        info "IPv6 will be disabled."
    fi

    sysctl --system
    info "sysctl hardening applied."
    mark_done "step_sysctl"
fi

# ─── 9. Misc ─────────────────────────────────────────────────────────────────

if step_done "step_misc"; then
    skip "Misc setup (already done)"
else
    TZ_CHOICE="$(load_var timezone)"
    if [[ -z "$TZ_CHOICE" ]]; then
        read -rp "Timezone [UTC]: " TZ_CHOICE
        TZ_CHOICE="${TZ_CHOICE:-UTC}"
        save_var timezone "$TZ_CHOICE"
    fi
    timedatectl set-timezone "$TZ_CHOICE"
    info "Timezone set to $TZ_CHOICE."

    if dpkg -l snapd &>/dev/null 2>&1; then
        read -rp "Remove snapd? [Y/n] " remove_snap
        remove_snap="${remove_snap:-Y}"
        if [[ "$remove_snap" =~ ^[Yy]$ ]]; then
            apt purge -y snapd
            info "snapd removed."
        fi
    fi

    mark_done "step_misc"
fi

# ─── 10. Summary ─────────────────────────────────────────────────────────────

mark_done "complete"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "Server hardening complete. Here's what was done:"
echo ""
echo "  [+] System packages updated"
echo "  [+] User '$DEPLOY_USER' created with sudo + SSH key"
echo "  [+] SSH: root login disabled, password auth disabled"
echo "  [+] SSH: only '$DEPLOY_USER' may log in"
echo "  [+] UFW firewall enabled (SSH only)"
echo "  [+] fail2ban enabled (SSH jail, 5 retries / 10-min ban)"
echo "  [+] Automatic security updates enabled"
echo "  [+] Kernel/network sysctl hardening applied"
echo "  [+] Timezone set to $(load_var timezone)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
warn "IMPORTANT — do NOT close this session yet!"
echo ""
echo "  1. Open a NEW terminal"
echo "  2. SSH in as the deploy user:  ssh $DEPLOY_USER@<this-ip>"
echo "  3. Verify you can run:         sudo whoami"
echo "  4. Only then close this root session"
echo ""
echo "  If you lock yourself out, use the Linode console (Lish) to recover."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
