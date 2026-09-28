/* ═══════════════════════════════════════════════════
   ProofJudge — Frontend Application
   ═══════════════════════════════════════════════════ */

import { createClient, createAccount } from 'genlayer-js';
import { localnet } from 'genlayer-js/chains';

// ─── Configuration ───
const CONFIG = {
  // Contract address — must be updated after deployment
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS || '',
  rpcUrl: import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:4000/api',
};

// ─── State ───
const state = {
  client: null,
  account: null,
  agreements: [],
  currentFilter: 'ALL',
  connected: false,
};

// ─── GenLayer Client Setup ───
function initClient() {
  try {
    const account = createAccount();
    state.account = account.address;
    state.client = createClient({
      chain: localnet,
      account: account,
    });
    updateNetworkBadge(true);
    return true;
  } catch (err) {
    console.error('Failed to initialize GenLayer client:', err);
    updateNetworkBadge(false);
    showToast('error', 'Connection Failed', 'Could not connect to GenLayer node.');
    return false;
  }
}

// ─── Wallet Connection ───
async function connectWallet() {
  const btn = document.getElementById('connect-wallet-btn');
  if (state.connected) {
    showToast('info', 'Already Connected', truncateAddress(state.account));
    return;
  }

  try {
    btn.textContent = 'Connecting…';

    // Account was already created during init
    if (state.account) {
      state.connected = true;
      btn.textContent = truncateAddress(state.account);
      btn.classList.add('connected');
      showToast('success', 'Wallet Connected', `Account: ${truncateAddress(state.account)}`);
      await loadAgreements();
    } else {
      throw new Error('No account available — client not initialized');
    }
  } catch (err) {
    console.error('Wallet connection failed:', err);
    btn.textContent = 'Connect Wallet';
    showToast('error', 'Connection Failed', err.message || 'Could not connect wallet.');
  }
}

// ─── Contract Read Helpers ───
async function readContract(method, args = []) {
  if (!CONFIG.contractAddress) {
    showToast('warning', 'No Contract', 'Set VITE_CONTRACT_ADDRESS in your .env file.');
    return null;
  }

  try {
    const result = await state.client.readContract({
      address: CONFIG.contractAddress,
      functionName: method,
      args,
    });
    return result;
  } catch (err) {
    console.error(`readContract(${method}) failed:`, err);
    throw err;
  }
}

async function writeContract(method, args = []) {
  if (!CONFIG.contractAddress) {
    showToast('warning', 'No Contract', 'Set VITE_CONTRACT_ADDRESS in your .env file.');
    return null;
  }

  if (!state.connected) {
    showToast('warning', 'Not Connected', 'Please connect your wallet first.');
    return null;
  }

  try {
    const txHash = await state.client.writeContract({
      address: CONFIG.contractAddress,
      functionName: method,
      args,
    });

    // Wait for transaction receipt
    const transaction = await state.client.waitForTransactionReceipt({
      hash: txHash,
      retries: 50,
    });

    return transaction;
  } catch (err) {
    console.error(`writeContract(${method}) failed:`, err);
    throw err;
  }
}

// ─── Load Agreements ───
async function loadAgreements() {
  try {
    const count = await readContract('get_agreements_count');
    if (count === null) return;

    const total = Number(count);
    const agreements = [];

    for (let i = 0; i < total; i++) {
      const ag = await readContract('get_agreement', [i]);
      if (ag) agreements.push(ag);
    }

    state.agreements = agreements;
    renderDashboard();
    updateStats();
  } catch (err) {
    console.error('Failed to load agreements:', err);
    showToast('error', 'Load Failed', 'Could not fetch agreements from contract.');
  }
}

// ─── Render Dashboard ───
function renderDashboard() {
  const grid = document.getElementById('agreements-grid');
  const countBadge = document.getElementById('agreements-count-badge');

  const filtered = state.currentFilter === 'ALL'
    ? state.agreements
    : state.agreements.filter(a => a.status === state.currentFilter);

  countBadge.textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>${state.agreements.length === 0 ? 'No agreements yet.' : 'No agreements match this filter.'}</p>
        <p class="empty-hint">${state.agreements.length === 0 ? 'Create one to get started!' : 'Try a different filter.'}</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(ag => `
    <div class="agreement-card" data-id="${ag.id}" style="--card-accent: var(--card-accent)">
      <div class="card-top">
        <span class="card-id">#${ag.id}</span>
        <span class="status-badge status-${ag.status}">${formatStatus(ag.status)}</span>
      </div>
      <div class="card-title">${escapeHtml(ag.title)}</div>
      <div class="card-description">${escapeHtml(ag.description || 'No description')}</div>
      <div class="card-meta">
        <span class="card-reqs">${(ag.requirements || []).length} requirement${(ag.requirements || []).length !== 1 ? 's' : ''}</span>
        <span>${formatTimestamp(ag.created_at)}</span>
      </div>
    </div>
  `).join('');

  // Attach click handlers
  grid.querySelectorAll('.agreement-card').forEach(card => {
    card.addEventListener('click', () => openAgreementDetail(Number(card.dataset.id)));
  });
}

// ─── Update Stats ───
function updateStats() {
  const total = state.agreements.length;
  const approved = state.agreements.filter(a => a.status === 'APPROVED').length;
  const open = state.agreements.filter(a => a.status === 'OPEN').length;

  animateCounter('stat-total', total);
  animateCounter('stat-approved', approved);
  animateCounter('stat-open', open);
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  const current = parseInt(el.textContent) || 0;
  if (current === target) {
    el.textContent = target;
    return;
  }

  const duration = 400;
  const start = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(current + (target - current) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// ─── Open Agreement Detail Modal ───
function openAgreementDetail(id) {
  const ag = state.agreements.find(a => Number(a.id) === id);
  if (!ag) return;

  const modal = document.getElementById('agreement-modal');
  const body = document.getElementById('modal-body');

  const hasVerdict = ag.verdict_decision !== 'PENDING';
  const criteriaPercent = ag.verdict_criteria_total > 0
    ? (ag.verdict_criteria_met / ag.verdict_criteria_total) * 100
    : 0;

  let criteriaColor = 'var(--color-neutral)';
  if (ag.verdict_decision === 'APPROVED') criteriaColor = 'var(--color-success)';
  else if (ag.verdict_decision === 'REJECTED') criteriaColor = 'var(--color-error)';

  body.innerHTML = `
    <div class="detail-header">
      <div class="card-top">
        <span class="card-id">#${ag.id}</span>
        <span class="status-badge status-${ag.status}">${formatStatus(ag.status)}</span>
      </div>
      <h2 class="detail-title">${escapeHtml(ag.title)}</h2>
      <div class="detail-meta">
        <span>Created ${formatTimestamp(ag.created_at)}</span>
        ${ag.submitted_at > 0 ? `<span>Submitted ${formatTimestamp(ag.submitted_at)}</span>` : ''}
        ${ag.finalized_at > 0 ? `<span>Finalized ${formatTimestamp(ag.finalized_at)}</span>` : ''}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Description</div>
      <p class="detail-description">${escapeHtml(ag.description || 'No description provided.')}</p>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Requirements (${(ag.requirements || []).length})</div>
      <ul class="requirements-list">
        ${(ag.requirements || []).map((r, i) => `
          <li><span class="req-bullet">${i + 1}.</span> ${escapeHtml(r)}</li>
        `).join('')}
      </ul>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Participants</div>
      <p><strong>Creator:</strong> <span class="address-mono">${ag.creator || '—'}</span></p>
      <p style="margin-top:6px"><strong>Worker:</strong> <span class="address-mono">${ag.worker && ag.worker !== '0x0000000000000000000000000000000000000000' ? ag.worker : 'Not assigned'}</span></p>
    </div>

    ${ag.evidence_url ? `
      <div class="detail-section">
        <div class="detail-section-title">Submitted Evidence</div>
        <p><strong>Evidence:</strong> <a class="detail-link" href="${escapeHtml(ag.evidence_url)}" target="_blank" rel="noopener">🔗 ${escapeHtml(ag.evidence_url)}</a></p>
        ${ag.github_url ? `<p style="margin-top:6px"><strong>GitHub:</strong> <a class="detail-link" href="${escapeHtml(ag.github_url)}" target="_blank" rel="noopener">🔗 ${escapeHtml(ag.github_url)}</a></p>` : ''}
        ${ag.explanation ? `<p style="margin-top:6px"><strong>Explanation:</strong> ${escapeHtml(ag.explanation)}</p>` : ''}
      </div>
    ` : ''}

    ${hasVerdict ? `
      <div class="detail-section">
        <div class="detail-section-title">AI Verdict</div>
        <div class="verdict-box">
          <div class="verdict-decision status-badge status-${ag.verdict_decision}" style="display:inline-block;font-size:0.9rem;padding:6px 16px;">
            ${formatStatus(ag.verdict_decision)}
          </div>
          <div class="verdict-criteria">
            <div class="criteria-bar">
              <div class="criteria-fill" style="width:${criteriaPercent}%; background:${criteriaColor}"></div>
            </div>
            <span class="criteria-label">${ag.verdict_criteria_met}/${ag.verdict_criteria_total}</span>
          </div>
          ${ag.verdict_summary ? `<p class="verdict-summary"><strong>Summary:</strong> ${escapeHtml(ag.verdict_summary)}</p>` : ''}
          ${ag.verdict_reason ? `<p class="verdict-reason"><strong>Reason:</strong> ${escapeHtml(ag.verdict_reason)}</p>` : ''}
        </div>
      </div>
    ` : ''}

    <div class="modal-actions">
      ${ag.status === 'OPEN' ? `
        <button class="modal-action-btn" onclick="window._pj_submitToAgreement(${ag.id})">📤 Submit Work</button>
      ` : ''}
      ${ag.status === 'SUBMITTED' ? `
        <button class="modal-action-btn action-evaluate" onclick="window._pj_evaluateAgreement(${ag.id})">⚖ Request Evaluation</button>
      ` : ''}
    </div>
  `;

  modal.hidden = false;
}

// ─── Create Agreement Handler ───
async function handleCreateAgreement(e) {
  e.preventDefault();
  const btn = document.getElementById('create-submit-btn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');

  const title = document.getElementById('create-title').value.trim();
  const description = document.getElementById('create-description').value.trim();
  const deadlineHours = parseInt(document.getElementById('create-deadline').value);

  // Collect requirements
  const reqInputs = document.querySelectorAll('#requirements-editor .req-input');
  const requirements = Array.from(reqInputs).map(el => el.value.trim()).filter(v => v.length > 0);

  if (requirements.length === 0) {
    showToast('warning', 'Missing Requirements', 'Add at least one requirement.');
    return;
  }

  btn.disabled = true;
  btnText.textContent = 'Creating…';
  btnLoader.hidden = false;

  try {
    await writeContract('create_agreement', [title, description, requirements, deadlineHours]);
    showToast('success', 'Agreement Created', `"${title}" is now live on GenLayer.`);

    // Reset form
    document.getElementById('create-form').reset();
    resetRequirementsEditor();

    // Switch to dashboard
    switchView('dashboard');
    await loadAgreements();
  } catch (err) {
    showToast('error', 'Creation Failed', err.message || 'Transaction failed.');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Create Agreement';
    btnLoader.hidden = true;
  }
}

// ─── Submit Work Handler ───
async function handleSubmitWork(e) {
  e.preventDefault();
  const btn = document.getElementById('submit-work-btn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');

  const agreementId = parseInt(document.getElementById('submit-agreement-id').value);
  const evidenceUrl = document.getElementById('submit-evidence-url').value.trim();
  const githubUrl = document.getElementById('submit-github-url').value.trim();
  const explanation = document.getElementById('submit-explanation').value.trim();

  btn.disabled = true;
  btnText.textContent = 'Submitting…';
  btnLoader.hidden = false;

  try {
    await writeContract('submit_work', [agreementId, evidenceUrl, githubUrl, explanation]);
    showToast('success', 'Work Submitted', `Evidence submitted for agreement #${agreementId}.`);

    document.getElementById('submit-form').reset();
    switchView('dashboard');
    await loadAgreements();
  } catch (err) {
    showToast('error', 'Submission Failed', err.message || 'Transaction failed.');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Submit Evidence';
    btnLoader.hidden = true;
  }
}

// ─── Evaluate Agreement ───
async function evaluateAgreement(agreementId) {
  showToast('info', 'Evaluation Started', `Requesting AI consensus for agreement #${agreementId}… This may take a moment.`);
  closeModal();

  try {
    await writeContract('evaluate_submission', [agreementId]);
    showToast('success', 'Evaluation Complete', `Agreement #${agreementId} has been evaluated.`);
    await loadAgreements();
  } catch (err) {
    showToast('error', 'Evaluation Failed', err.message || 'Consensus transaction failed.');
  }
}

// ─── Navigate to Submit Work with pre-filled ID ───
function submitToAgreement(agreementId) {
  closeModal();
  switchView('submit');
  document.getElementById('submit-agreement-id').value = agreementId;
}

// Expose to onclick handlers in modal HTML
window._pj_submitToAgreement = submitToAgreement;
window._pj_evaluateAgreement = evaluateAgreement;

// ─── Navigation ───
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`view-${viewName}`)?.classList.add('active');
  document.querySelector(`.nav-btn[data-view="${viewName}"]`)?.classList.add('active');
}

// ─── Requirements Editor ───
function addRequirementRow() {
  const editor = document.getElementById('requirements-editor');
  const count = editor.querySelectorAll('.req-row').length;
  const row = document.createElement('div');
  row.className = 'req-row';
  row.innerHTML = `
    <span class="req-number">${count + 1}.</span>
    <input type="text" class="req-input" placeholder="e.g., Requirement ${count + 1}" />
    <button type="button" class="req-remove" title="Remove">×</button>
  `;
  editor.appendChild(row);

  row.querySelector('.req-remove').addEventListener('click', () => {
    row.remove();
    renumberRequirements();
  });

  row.querySelector('.req-input').focus();
}

function renumberRequirements() {
  document.querySelectorAll('#requirements-editor .req-row').forEach((row, i) => {
    row.querySelector('.req-number').textContent = `${i + 1}.`;
  });
}

function resetRequirementsEditor() {
  const editor = document.getElementById('requirements-editor');
  editor.innerHTML = `
    <div class="req-row">
      <span class="req-number">1.</span>
      <input type="text" class="req-input" placeholder="e.g., Responsive design across all devices" />
      <button type="button" class="req-remove" title="Remove">×</button>
    </div>
  `;
  bindReqRemoveButtons();
}

function bindReqRemoveButtons() {
  document.querySelectorAll('#requirements-editor .req-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const editor = document.getElementById('requirements-editor');
      if (editor.querySelectorAll('.req-row').length > 1) {
        btn.closest('.req-row').remove();
        renumberRequirements();
      }
    });
  });
}

// ─── Modal ───
function closeModal() {
  document.getElementById('agreement-modal').hidden = true;
}

// ─── UI Helpers ───
function updateNetworkBadge(connected) {
  const badge = document.getElementById('network-badge');
  const name = document.getElementById('network-name');

  if (connected) {
    badge.classList.remove('disconnected');
    name.textContent = 'GenLayer Simulator';
  } else {
    badge.classList.add('disconnected');
    name.textContent = 'Disconnected';
  }
}

function formatStatus(status) {
  return (status || 'UNKNOWN').replace(/_/g, ' ');
}

function formatTimestamp(ts) {
  if (!ts || ts === 0) return '—';
  const date = new Date(Number(ts) * 1000);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function truncateAddress(addr) {
  if (!addr) return '—';
  const s = typeof addr === 'string' ? addr : `0x${addr}`;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Toast Notifications ───
function showToast(type, title, message) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ─── Initialize App ───
function init() {
  // Initialize client
  initClient();

  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Connect wallet
  document.getElementById('connect-wallet-btn').addEventListener('click', connectWallet);

  // Create form
  document.getElementById('create-form').addEventListener('submit', handleCreateAgreement);
  document.getElementById('add-requirement-btn').addEventListener('click', addRequirementRow);
  bindReqRemoveButtons();

  // Submit form
  document.getElementById('submit-form').addEventListener('submit', handleSubmitWork);

  // Filter
  document.getElementById('filter-status').addEventListener('change', (e) => {
    state.currentFilter = e.target.value;
    renderDashboard();
  });

  // Refresh
  document.getElementById('refresh-btn').addEventListener('click', loadAgreements);

  // Modal close
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('agreement-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Logo
  document.getElementById('logo-link').addEventListener('click', (e) => {
    e.preventDefault();
    switchView('dashboard');
  });

  // Initial render
  renderDashboard();
  updateStats();

  // Show demo info if no contract address
  if (!CONFIG.contractAddress) {
    showToast('info', 'Demo Mode', 'Set VITE_CONTRACT_ADDRESS in .env to connect to a deployed contract.');
  }
}

document.addEventListener('DOMContentLoaded', init);
