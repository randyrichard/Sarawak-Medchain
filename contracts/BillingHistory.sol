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

    // Track all hospitals for admin queries
    address[] public allHospitals;
    mapping(address => bool) public isRegisteredHospital;

    // Record of each MC issued
    struct MCRecord {
        address hospital;
        uint256 timestamp;
    }

    // Hospital balance info for batch queries
    struct HospitalBalance {
        address hospital;
        int256 balance;
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
     * @dev Register a hospital if not already registered
     */
    function _registerHospital(address _hospital) internal {
        if (!isRegisteredHospital[_hospital]) {
            allHospitals.push(_hospital);
            isRegisteredHospital[_hospital] = true;
        }
    }

    /**
     * @dev Issue a digital MC. Records timestamp and hospital, deducts 1 credit.
     * @param _hospital Address of the hospital/doctor to charge
     */
    function issueDigitalMC(address _hospital) external {
        require(_hospital != address(0), "Invalid hospital address");

        // Register hospital if new
        _registerHospital(_hospital);

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

        // Register hospital if new
        _registerHospital(_hospital);

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

    /**
     * @dev Get list of all registered hospitals
     * @return hospitals Array of all hospital addresses
     */
    function getAllHospitals() external view returns (address[] memory hospitals) {
        return allHospitals;
    }

    /**
     * @dev Get number of registered hospitals
     * @return count Number of hospitals
     */
    function getHospitalCount() external view returns (uint256 count) {
        return allHospitals.length;
    }

    /**
     * @dev Get all hospital balances (admin view)
     * @return balances Array of all hospital addresses and their balances
     */
    function getAllHospitalBalances() external view returns (HospitalBalance[] memory balances) {
        balances = new HospitalBalance[](allHospitals.length);
        for (uint256 i = 0; i < allHospitals.length; i++) {
            balances[i] = HospitalBalance({
                hospital: allHospitals[i],
                balance: hospitalCredits[allHospitals[i]]
            });
        }
        return balances;
    }
}
