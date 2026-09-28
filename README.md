# ProofJudge

**Trustless verification of human-defined work agreements using GenLayer.**

[![GenLayer](https://img.shields.io/badge/Built%20on-GenLayer-6366f1)](https://genlayer.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Overview

ProofJudge enables trustless, on-chain evaluation of natural language work agreements. Unlike traditional smart contracts that can only verify numerical or boolean conditions, ProofJudge leverages GenLayer's AI-validator consensus to evaluate whether submitted work evidence actually satisfies human-defined requirements.

### How It Works

```
1. Creator defines a work agreement with natural language requirements
   → "Build a landing page: responsive design, 5 sections, contact form, deployed publicly"

2. Worker submits evidence (live URLs, GitHub repos, explanations)
   → "https://my-site.vercel.app" + "https://github.com/user/repo"

3. GenLayer validators independently inspect the evidence
   → Each validator fetches the live site, reads the code, evaluates criteria

4. Consensus produces an on-chain verdict
   → APPROVED / REJECTED / INSUFFICIENT_EVIDENCE with detailed reasoning
```

### Key Features

- **Natural language requirements** — Define work criteria in plain English
- **Live web evidence inspection** — Validators fetch and analyze deployed sites
- **Prompt injection resistant** — Adversarial content in evidence is treated as untrusted data
- **Deterministic integrity checks** — Contract enforces that APPROVED requires all criteria met
- **Full transparency** — All verdicts include per-criteria analysis and reasoning

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Frontend (Vite + genlayer-js)                      │
│  Create agreements, submit evidence, view verdicts   │
└─────────────────┬────────────────────────────────────┘
                  │ GenLayerJS Client
                  ▼
┌──────────────────────────────────────────────────────┐
│  GenLayer Network                                    │
│  ┌────────────────────────────────────────────────┐  │
│  │  ProofJudge Contract (Python)                  │  │
│  │  ├── create_agreement()    — defines criteria  │  │
│  │  ├── submit_work()         — provides evidence │  │
│  │  └── evaluate_submission() — AI consensus      │  │
│  │       ├── Leader: fetch URLs + LLM evaluation  │  │
│  │       └── Validators: verify verdict integrity │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  Consensus Committee                           │  │
│  │  Multiple validators independently evaluate    │  │
│  │  and reach agreement on the verdict            │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 20+ with npm
- [GenLayer Simulator](https://docs.genlayer.com/developers/simulator) (for local development)

### 1. Clone & Setup Contract Environment

```bash
# Clone the repo
git clone https://github.com/stalker023reg/proofjudge.git
cd proofjudge

# Create Python virtual environment
python -m venv .venv
.venv/Scripts/activate      # Windows
# source .venv/bin/activate  # Linux/Mac

pip install genlayer-test pytest
```

### 2. Run Tests

```bash
pytest tests/ -v
```

All 9 tests should pass, covering:
- Agreement creation & validation
- Work submission & URL validation
- AI evaluation: approved, rejected, insufficient evidence
- Prompt injection resistance
- Re-evaluation prevention

### 3. Setup Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env to set VITE_CONTRACT_ADDRESS after deploying
npm run dev
```

### 4. Deploy Contract

Deploy using [GenLayer Studio](https://studio.genlayer.com) or the CLI:

```bash
# Via GenLayer Studio: upload contracts/proof_judge.py
# Note the contract address and set it in frontend/.env
```

## Project Structure

```
proofjudge/
├── contracts/
│   └── proof_judge.py          # GenLayer Intelligent Contract
├── tests/
│   └── test_proof_judge.py     # 9 comprehensive tests
├── frontend/
│   ├── src/
│   │   ├── main.js             # App logic with genlayer-js
│   │   └── styles.css          # Design system
│   ├── index.html              # SPA entry point
│   ├── package.json            # Frontend dependencies
│   └── vite.config.js          # Vite configuration
├── docs/
│   ├── architecture.md         # System architecture
│   ├── evaluation-design.md    # AI evaluation design
│   ├── genlayer-reference.md   # GenLayer API reference
│   └── threat-model.md         # Security analysis
└── README.md
```

## Smart Contract API

### Write Methods

| Method | Params | Description |
|--------|--------|-------------|
| `create_agreement` | `title, description, requirements[], deadline_hours` | Create a new work agreement |
| `submit_work` | `agreement_id, evidence_url, github_url, explanation` | Submit work evidence |
| `evaluate_submission` | `agreement_id` | Trigger AI consensus evaluation |

### Read Methods

| Method | Params | Returns |
|--------|--------|---------|
| `get_agreement` | `agreement_id` | Full agreement details |
| `get_verdict` | `agreement_id` | Verdict with reasoning |
| `get_agreements_count` | — | Total number of agreements |

## Security

ProofJudge includes multiple layers of protection:

1. **Prompt injection defense** — Evidence content is enclosed in `<untrusted_*>` XML tags with explicit instructions to treat it as passive data
2. **Deterministic integrity** — Contract enforces that `APPROVED` requires `criteria_met == criteria_total`
3. **Multi-validator consensus** — No single validator can manipulate the verdict
4. **Input validation** — All inputs are sanitized and validated before storage
5. **Status machine** — Strict state transitions prevent double-evaluation

See [docs/threat-model.md](docs/threat-model.md) for the full security analysis.

## License

MIT
