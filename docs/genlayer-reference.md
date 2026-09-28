# GenLayer Technical Reference (Authoritative)

Documented from official GenLayer documentation (`https://docs.genlayer.com/`) as of current production release.

---

## 1. Network & RPC Configuration

GenLayer operates on two layers:
1. **GenLayer RPC** (`gen_*` methods and passes through `eth_*` and `zks_*` calls)
2. **GenLayer Chain** (underlying L2 zkSync Elastic Chain for standard EVM operations)

### Environments

| Environment | GenLayer RPC | Chain ID | Currency | Explorer | Purpose |
|:---|:---|:---|:---|:---|:---|
| **Testnet Bradbury** | `https://rpc-bradbury.genlayer.com` | `4221` | GEN | `https://explorer-bradbury.genlayer.com` | Production-like testnet with real LLMs |
| **Studionet** | `https://studio.genlayer.com/api` | `61999` | GEN | `https://explorer-studio.genlayer.com` | Hosted development environment (zero setup) |
| **Localnet** | `http://localhost:4000/api` | `61127` | GEN | `http://localhost:8080` (Studio UI) | Local Docker / GLSim environment |

---

## 2. Intelligent Contract Specification (GenVM Python)

### Header & Runtime Pinning
Every Intelligent Contract file MUST begin with a runtime dependency pragma on line 1:
```python
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
```

### Module Imports
```python
from genlayer import *
```
Imports types into global scope (`Address`, `u256`, `i32`, `bigint`, `DynArray`, `TreeMap`, `allow_storage`, `dataclass`) and the `gl` namespace.

### Contract Class Structure
- Extends `gl.Contract`
- Only ONE contract class per file
- Constructor `def __init__(self, ...):` is private (unadorned)
- Public methods decorated with:
  - `@gl.public.view`: Read-only view methods (no transaction fees, executed locally against `LATEST_FINAL` or `LATEST_NONFINAL` state).
  - `@gl.public.write`: Modifies storage, submits a transaction to GenLayer consensus.
  - `@gl.public.write.payable`: Accepts value (`gl.message.value`).

### Persistent Storage Rules
- Persistent attributes MUST be declared at class level with type annotations.
- `list[T]` -> `DynArray[T]`
- `dict[K, V]` -> `TreeMap[K, V]`
- `int` -> `u256`, `i32`, or `bigint`
- Dataclasses stored on-chain MUST be decorated with `@allow_storage` and `@dataclass`.
- Inside non-deterministic blocks (`leader_fn` / `validator_fn`), storage writes are strictly FORBIDDEN. All storage updates must happen deterministically after consensus returns.

### Transaction Context (`gl.message`)
- `gl.message.sender_address`: `Address` of immediate caller.
- `gl.message.origin_address`: `Address` of original transaction submitter.
- `gl.message.contract_address`: `Address` of current contract.
- `gl.message.value`: `u256` value passed with payable call.
- `gl.message.chain_id`: `u256` current chain ID.
- Pinned deterministic time: `datetime.now(timezone.utc)` or `int(time.time())` is pinned to transaction execution time across all validators.

---

## 3. Non-Deterministic Operations & Consensus

### Execution Boundary
- **Inside Nondet Blocks**: `gl.nondet.web.*`, `gl.nondet.exec_prompt(...)`.
- **Outside Nondet Blocks (Deterministic)**: Storage writes (`self.var = ...`), cross-contract calls, message emissions.

### Web Access APIs
- `gl.nondet.web.get(url)`: Fetches HTTP GET response.
  `response.body.decode("utf-8")`, `response.status_code`.
- `gl.nondet.web.render(url, mode='html')`: Headless browser rendering of URL, returns full HTML.
- `gl.nondet.web.render(url, mode='screenshot')`: Returns binary image screenshot.
- `gl.nondet.web.request(url, method='POST', body={})`: General HTTP request.

### LLM Invocation APIs
- `gl.nondet.exec_prompt(prompt, response_format='json')`: Calls underlying LLM with prompt and optional JSON schema enforcement.

### Equivalence & Consensus Patterns
1. `gl.eq_principle.strict_eq(fn)`:
   All validators must return exact identical output. Used for deterministic web scrapes or stable API fields. Not suitable for raw LLM text generation.
2. `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`:
   The primary, robust pattern for LLM & Web validation:
   - `leader_fn()`: Leader fetches evidence and generates structured verdict.
   - `validator_fn(leader_res) -> bool`:
     Validators check the leader's proposed outcome against equivalence criteria:
     ```python
     def validator_fn(leader_res) -> bool:
         if not isinstance(leader_res, gl.vm.Return):
             return False
         # Validator independently evaluates or validates schema & evidence consistency
         return is_valid_verdict(leader_res.calldata)
     ```
3. Convenience wrappers:
   - `gl.eq_principle.prompt_comparative(fn, principle)`
   - `gl.eq_principle.prompt_non_comparative(input, task, criteria)`

---

## 4. Frontend SDK (`genlayer-js` 1.1.8)

### Installation
```bash
npm install genlayer-js
```

### Client Initialization
```typescript
import { createClient, createAccount, isSuccessful } from 'genlayer-js';
import { studionet, localnet, testnetBradbury } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';

const client = createClient({
  chain: studionet, // or testnetBradbury / localnet
  account: walletAddress as `0x${string}`,
  provider: window.ethereum, // EIP-1193 provider
});
```

### Contract Reads
```typescript
const result = await client.readContract({
  address: contractAddress,
  functionName: 'get_agreement',
  args: [agreementId],
  transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
});
```

### Contract Writes
```typescript
const writePayload = {
  address: contractAddress,
  functionName: 'submit_work',
  args: [agreementId, evidenceUrl, githubUrl, explanation],
};

const estimate = await client.estimateTransactionFeesForWrite(writePayload);
const txId = await client.writeContract({
  ...writePayload,
  fees: {
    distribution: estimate.distribution,
    feeValue: estimate.feeValue,
  },
});

const receipt = await client.waitForFinalization({ hash: txId });
if (!isSuccessful(receipt)) {
  throw new Error(`Write failed with status ${receipt.statusName}`);
}
```

---

## 5. Testing Framework (`genlayer-test` 0.29.x)

- Python testing powered by pytest:
  ```bash
  pytest tests/ -v
  ```
- Direct mode fixtures:
  - `direct_vm`: GenVM context with cheatcodes (`sender`, `prank`, `mock_web`, `mock_llm`, `run_validator`, `expect_revert`).
  - `direct_deploy`: In-process deployment function (`contract = direct_deploy("contracts/contract.py", *args)`).
  - Test accounts: `direct_owner`, `direct_alice`, `direct_bob`, `direct_charlie`.
