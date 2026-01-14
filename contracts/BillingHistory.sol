// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BillingHistory
 * @dev Tracks digital MC issuance and hospital credit balances
 */
contract BillingHistory {
    address public admin;

    // Hospital credits: positive = prepaid credits, negative = owes money
    mapping(address => int256) public hospitalCredits;

    // Record of each MC issued
    struct MCRecord {
        address hospital;
        uint256 timestamp;
    }

    MCRecord[] public mcHistory;

    // Events
    event MCIssued(address indexed hospital, uint256 timestamp);
    event CreditsAdded(address indexed hospital, uint256 amount, int256 newBalance);
    event CreditsDeducted(address indexed hospital, uint256 amount, int256 newBalance);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    /**
     * @dev Issue a digital MC. Records timestamp and hospital, deducts 1 credit.
     * @param _hospital Address of the hospital/doctor to charge
     */
    function issueDigitalMC(address _hospital) external {
        require(_hospital != address(0), "Invalid hospital address");

        // Record the MC issuance
        mcHistory.push(MCRecord({
            hospital: _hospital,
            timestamp: block.timestamp
        }));

        // Deduct 1 credit (can go negative = debt)
        hospitalCredits[_hospital] -= 1;

        emit MCIssued(_hospital, block.timestamp);
        emit CreditsDeducted(_hospital, 1, hospitalCredits[_hospital]);
    }

    /**
     * @dev Get hospital's credit balance. Negative means they owe money.
     * @param _hospital Address of the hospital
     * @return balance Current credit balance (negative = debt)
     */
    function getHospitalBalance(address _hospital) external view returns (int256 balance) {
        return hospitalCredits[_hospital];
    }

    /**
     * @dev Admin adds credits to a hospital's balance
     * @param _hospital Address of the hospital
     * @param _amount Number of credits to add
     */
    function addCredits(address _hospital, uint256 _amount) external onlyAdmin {
        require(_hospital != address(0), "Invalid hospital address");
        require(_amount > 0, "Amount must be greater than 0");

        hospitalCredits[_hospital] += int256(_amount);

        emit CreditsAdded(_hospital, _amount, hospitalCredits[_hospital]);
    }

    /**
     * @dev Get total number of MCs issued
     * @return count Total MC count
     */
    function getMCCount() external view returns (uint256 count) {
        return mcHistory.length;
    }

    /**
     * @dev Get all MC history records
     * @return records Array of all MC records
     */
    function getMCHistory() external view returns (MCRecord[] memory records) {
        return mcHistory;
    }

    /**
     * @dev Get MC records for a specific hospital
     * @param _hospital Address of the hospital
     * @return records Array of MC records for that hospital
     */
    function getHospitalMCHistory(address _hospital) external view returns (MCRecord[] memory records) {
        // Count records for this hospital
        uint256 count = 0;
        for (uint256 i = 0; i < mcHistory.length; i++) {
            if (mcHistory[i].hospital == _hospital) {
                count++;
            }
        }

        // Create result array
        records = new MCRecord[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < mcHistory.length; i++) {
            if (mcHistory[i].hospital == _hospital) {
                records[index] = mcHistory[i];
                index++;
            }
        }

        return records;
    }
}
