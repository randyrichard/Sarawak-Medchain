// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SarawakMedMVP
 * @notice Patient-controlled medical records with cryptographic access enforcement
 * @dev MVP contract for proving:
 *      1. Only verified doctors can write medical records
 *      2. Patients explicitly control who can read their records
 *      3. Access revocation is enforced by code
 *      4. Every write and access attempt is auditable
 */
contract SarawakMedMVP {

    // ========== STATE VARIABLES ==========

    address public admin; // Simulates Sarawak Medical Council

    // ========== STRUCTS ==========

    struct MedicalRecord {
        address patientAddress;
        string ipfsHash;
        uint256 timestamp;
        address doctorAddress;
    }

    // ========== MAPPINGS ==========

    // Track verified doctors
    mapping(address => bool) public verifiedDoctors;

    // Patient records: patient address => array of records
    mapping(address => MedicalRecord[]) private patientRecords;

    // Access control: patient => doctor => has access
    mapping(address => mapping(address => bool)) public accessPermissions;

    // ========== EVENTS ==========

    event DoctorVerified(address indexed doctorAddress, uint256 timestamp);
    event DoctorRemoved(address indexed doctorAddress, uint256 timestamp);
    event RecordWritten(
        address indexed patientAddress,
        address indexed doctorAddress,
        string ipfsHash,
        uint256 timestamp
    );
    event AccessGranted(
        address indexed patientAddress,
        address indexed doctorAddress,
        uint256 timestamp
    );
    event AccessRevoked(
        address indexed patientAddress,
        address indexed doctorAddress,
        uint256 timestamp
    );
    event AccessAttempted(
        address indexed doctorAddress,
        address indexed patientAddress,
        bool success,
        uint256 timestamp
    );

    // ========== MODIFIERS ==========

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    modifier onlyVerifiedDoctor() {
        require(verifiedDoctors[msg.sender], "Only verified doctors can call this function");
        _;
    }

    modifier onlyPatient(address _patient) {
        require(msg.sender == _patient, "Only the patient can perform this action");
        _;
    }

    // ========== CONSTRUCTOR ==========

    constructor() {
        admin = msg.sender;
    }

    // ========== ADMIN FUNCTIONS ==========

    /**
     * @notice Add a verified doctor (simulates SMC verification)
     * @param _doctorAddress Address of the doctor to verify
     */
    function addVerifiedDoctor(address _doctorAddress) external onlyAdmin {
        require(_doctorAddress != address(0), "Invalid doctor address");
        require(!verifiedDoctors[_doctorAddress], "Doctor already verified");

        verifiedDoctors[_doctorAddress] = true;
        emit DoctorVerified(_doctorAddress, block.timestamp);
    }

    /**
     * @notice Remove a verified doctor
     * @param _doctorAddress Address of the doctor to remove
     */
    function removeVerifiedDoctor(address _doctorAddress) external onlyAdmin {
        require(verifiedDoctors[_doctorAddress], "Doctor not verified");

        verifiedDoctors[_doctorAddress] = false;
        emit DoctorRemoved(_doctorAddress, block.timestamp);
    }

    // ========== DOCTOR FUNCTIONS ==========

    /**
     * @notice Write a medical record for a patient
     * @param _patientAddress Address of the patient
     * @param _ipfsHash IPFS hash of the encrypted medical document
     */
    function writeRecord(
        address _patientAddress,
        string memory _ipfsHash
    ) external onlyVerifiedDoctor {
        require(_patientAddress != address(0), "Invalid patient address");
        require(bytes(_ipfsHash).length > 0, "IPFS hash cannot be empty");

        MedicalRecord memory newRecord = MedicalRecord({
            patientAddress: _patientAddress,
            ipfsHash: _ipfsHash,
            timestamp: block.timestamp,
            doctorAddress: msg.sender
        });

        patientRecords[_patientAddress].push(newRecord);

        emit RecordWritten(
            _patientAddress,
            msg.sender,
            _ipfsHash,
            block.timestamp
        );
    }

    /**
     * @notice Read a patient's medical records (requires permission)
     * @param _patientAddress Address of the patient
     * @return Array of medical records
     */
    function readRecords(address _patientAddress)
        external
        returns (MedicalRecord[] memory)
    {
        bool _hasAccess = accessPermissions[_patientAddress][msg.sender];

        emit AccessAttempted(
            msg.sender,
            _patientAddress,
            _hasAccess,
            block.timestamp
        );

        require(
            _hasAccess || msg.sender == _patientAddress,
            "Access denied: No permission to read these records"
        );

        return patientRecords[_patientAddress];
    }

    // ========== PATIENT FUNCTIONS ==========

    /**
     * @notice Grant access to a doctor to read your records
     * @param _doctorAddress Address of the doctor to grant access to
     */
    function grantAccess(address _doctorAddress) external {
        require(_doctorAddress != address(0), "Invalid doctor address");
        require(verifiedDoctors[_doctorAddress], "Doctor is not verified");
        require(!accessPermissions[msg.sender][_doctorAddress], "Access already granted");

        accessPermissions[msg.sender][_doctorAddress] = true;

        emit AccessGranted(msg.sender, _doctorAddress, block.timestamp);
    }

    /**
     * @notice Revoke access from a doctor
     * @param _doctorAddress Address of the doctor to revoke access from
     */
    function revokeAccess(address _doctorAddress) external {
        require(accessPermissions[msg.sender][_doctorAddress], "Access not granted");

        accessPermissions[msg.sender][_doctorAddress] = false;

        emit AccessRevoked(msg.sender, _doctorAddress, block.timestamp);
    }

    /**
     * @notice Get your own medical records
     * @return Array of your medical records
     */
    function getMyRecords() external view returns (MedicalRecord[] memory) {
        return patientRecords[msg.sender];
    }

    /**
     * @notice Get count of your medical records
     * @return Number of records
     */
    function getMyRecordsCount() external view returns (uint256) {
        return patientRecords[msg.sender].length;
    }

    /**
     * @notice Check if a doctor has access to your records
     * @param _doctorAddress Address of the doctor to check
     * @return bool indicating if access is granted
     */
    function hasAccess(address _doctorAddress) external view returns (bool) {
        return accessPermissions[msg.sender][_doctorAddress];
    }

    /**
     * @notice Check if an address is a verified doctor
     * @param _doctorAddress Address to check
     * @return bool indicating if the address is a verified doctor
     */
    function isVerifiedDoctor(address _doctorAddress) external view returns (bool) {
        return verifiedDoctors[_doctorAddress];
    }
}
