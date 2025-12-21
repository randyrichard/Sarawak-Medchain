pragma solidity ^0.8.28;

contract SarawakMedChain {
    address public admin;

    struct MedicalRecord {
        string fileHash;      
        string providerName;  
        uint256 timestamp;
    }

    mapping(address => MedicalRecord[]) private records;

    constructor() {
        admin = msg.sender;
    }

    
    function addRecord(address _patient, string memory _hash, string memory _provider) public {
        records[_patient].push(MedicalRecord(_hash, _provider, block.timestamp));
    }

    
    function getMyHistory() public view returns (MedicalRecord[] memory) {
        return records[msg.sender];
    }
}