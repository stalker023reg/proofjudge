import pytest
import json
from gltest.direct.vm import VMContext

def test_fetch_error_logic():
    direct_vm = VMContext()
    
    def _deploy(filename):
        with open(filename, "r", encoding="utf-8") as f:
            code = f.read()
        address = direct_vm.deploy(code)
        class ContractProxy:
            def __getattr__(self, name):
                def wrapper(*args, **kwargs):
                    return direct_vm.call(address, name, *args, **kwargs)
                return wrapper
        return ContractProxy()

    direct_vm.sender = b'alice1234567890123456789'
    contract = _deploy("contracts/proof_judge.py")
    contract.create_agreement("Website", "Simple website", ["Live URL"], 24)
    direct_vm.sender = b'bob123456789012345678901'
    contract.submit_work(0, "https://dead-link-404.example.com", "", "Uploaded")
    
    direct_vm.mock_web(
        r".*dead-link.*",
        {"status": 404, "body": "Not Found"},
    )
    direct_vm.mock_llm(
        r".*",
        json.dumps({
            "decision": "INSUFFICIENT_EVIDENCE",
            "criteria_results": [
                {"requirement_index": 1, "met": False, "reasoning": "Unreachable"}
            ],
            "summary": "Target site returned 404 Not Found."
        }),
    )
    
    verdict = contract.evaluate_submission(0)
    print("VERDICT:", verdict)
    
if __name__ == "__main__":
    test_fetch_error_logic()
