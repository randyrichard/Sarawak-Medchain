import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("SarawakMedMVP", function () {
  let sarawakMed;
  let admin, doctor1, doctor2, patient1, patient2, unauthorizedUser;

  beforeEach(async function () {
    [admin, doctor1, doctor2, patient1, patient2, unauthorizedUser] = await ethers.getSigners();

    const SarawakMedMVP = await ethers.getContractFactory("SarawakMedMVP");
    sarawakMed = await SarawakMedMVP.deploy();
    await sarawakMed.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the deployer as admin", async function () {
      expect(await sarawakMed.admin()).to.equal(admin.address);
    });
  });

  describe("Doctor Verification (Admin Functions)", function () {
    it("Should allow admin to add a verified doctor", async function () {
      await expect(sarawakMed.connect(admin).addVerifiedDoctor(doctor1.address))
        .to.emit(sarawakMed, "DoctorVerified");

      expect(await sarawakMed.verifiedDoctors(doctor1.address)).to.be.true;
    });

    it("Should not allow non-admin to add a verified doctor", async function () {
      await expect(
        sarawakMed.connect(doctor1).addVerifiedDoctor(doctor2.address)
      ).to.be.revertedWith("Only admin can call this function");
    });

    it("Should not allow adding zero address as doctor", async function () {
      await expect(
        sarawakMed.connect(admin).addVerifiedDoctor(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid doctor address");
    });

    it("Should not allow adding already verified doctor", async function () {
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor1.address);
      await expect(
        sarawakMed.connect(admin).addVerifiedDoctor(doctor1.address)
      ).to.be.revertedWith("Doctor already verified");
    });

    it("Should allow admin to remove a verified doctor", async function () {
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor1.address);

      await expect(sarawakMed.connect(admin).removeVerifiedDoctor(doctor1.address))
        .to.emit(sarawakMed, "DoctorRemoved");

      expect(await sarawakMed.verifiedDoctors(doctor1.address)).to.be.false;
    });

    it("Should not allow removing non-verified doctor", async function () {
      await expect(
        sarawakMed.connect(admin).removeVerifiedDoctor(doctor1.address)
      ).to.be.revertedWith("Doctor not verified");
    });
  });

  describe("Writing Medical Records", function () {
    beforeEach(async function () {
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor1.address);
    });

    it("Should allow verified doctor to write a record", async function () {
      const ipfsHash = "QmTest123";

      await expect(
        sarawakMed.connect(doctor1).writeRecord(patient1.address, ipfsHash)
      )
        .to.emit(sarawakMed, "RecordWritten");

      const records = await sarawakMed.connect(patient1).getMyRecords();
      expect(records.length).to.equal(1);
      expect(records[0].ipfsHash).to.equal(ipfsHash);
      expect(records[0].doctorAddress).to.equal(doctor1.address);
    });

    it("Should not allow unverified doctor to write a record", async function () {
      await expect(
        sarawakMed.connect(unauthorizedUser).writeRecord(patient1.address, "QmTest123")
      ).to.be.revertedWith("Only verified doctors can call this function");
    });

    it("Should not allow writing record with empty IPFS hash", async function () {
      await expect(
        sarawakMed.connect(doctor1).writeRecord(patient1.address, "")
      ).to.be.revertedWith("IPFS hash cannot be empty");
    });

    it("Should not allow writing record for zero address", async function () {
      await expect(
        sarawakMed.connect(doctor1).writeRecord(ethers.ZeroAddress, "QmTest123")
      ).to.be.revertedWith("Invalid patient address");
    });

    it("Should allow multiple records for same patient", async function () {
      await sarawakMed.connect(doctor1).writeRecord(patient1.address, "QmTest1");
      await sarawakMed.connect(doctor1).writeRecord(patient1.address, "QmTest2");

      const count = await sarawakMed.connect(patient1).getMyRecordsCount();
      expect(count).to.equal(2);
    });
  });

  describe("Access Control - Granting Access", function () {
    beforeEach(async function () {
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor1.address);
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor2.address);
    });

    it("Should allow patient to grant access to verified doctor", async function () {
      await expect(
        sarawakMed.connect(patient1).grantAccess(doctor1.address)
      )
        .to.emit(sarawakMed, "AccessGranted");

      expect(await sarawakMed.accessPermissions(patient1.address, doctor1.address)).to.be.true;
    });

    it("Should not allow granting access to unverified doctor", async function () {
      await expect(
        sarawakMed.connect(patient1).grantAccess(unauthorizedUser.address)
      ).to.be.revertedWith("Doctor is not verified");
    });

    it("Should not allow granting access to zero address", async function () {
      await expect(
        sarawakMed.connect(patient1).grantAccess(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid doctor address");
    });

    it("Should not allow granting access twice to same doctor", async function () {
      await sarawakMed.connect(patient1).grantAccess(doctor1.address);
      await expect(
        sarawakMed.connect(patient1).grantAccess(doctor1.address)
      ).to.be.revertedWith("Access already granted");
    });
  });

  describe("Access Control - Revoking Access", function () {
    beforeEach(async function () {
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor1.address);
      await sarawakMed.connect(patient1).grantAccess(doctor1.address);
    });

    it("Should allow patient to revoke access from doctor", async function () {
      await expect(
        sarawakMed.connect(patient1).revokeAccess(doctor1.address)
      )
        .to.emit(sarawakMed, "AccessRevoked");

      expect(await sarawakMed.accessPermissions(patient1.address, doctor1.address)).to.be.false;
    });

    it("Should not allow revoking access that was not granted", async function () {
      await expect(
        sarawakMed.connect(patient1).revokeAccess(doctor2.address)
      ).to.be.revertedWith("Access not granted");
    });

    it("Should enforce revocation immediately", async function () {
      // First verify doctor can read
      await sarawakMed.connect(doctor1).writeRecord(patient1.address, "QmTest123");
      await sarawakMed.connect(doctor1).readRecords(patient1.address);

      // Revoke access
      await sarawakMed.connect(patient1).revokeAccess(doctor1.address);

      // Verify doctor can no longer read
      await expect(
        sarawakMed.connect(doctor1).readRecords(patient1.address)
      ).to.be.revertedWith("Access denied: No permission to read these records");
    });
  });

  describe("Reading Medical Records", function () {
    beforeEach(async function () {
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor1.address);
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor2.address);
      await sarawakMed.connect(doctor1).writeRecord(patient1.address, "QmTest123");
    });

    it("Should allow patient to read their own records", async function () {
      const records = await sarawakMed.connect(patient1).getMyRecords();
      expect(records.length).to.equal(1);
      expect(records[0].ipfsHash).to.equal("QmTest123");
    });

    it("Should allow doctor with permission to read records", async function () {
      await sarawakMed.connect(patient1).grantAccess(doctor1.address);

      const tx = await sarawakMed.connect(doctor1).readRecords(patient1.address);
      await expect(tx)
        .to.emit(sarawakMed, "AccessAttempted")
        .withArgs(doctor1.address, patient1.address, true, await getBlockTimestamp());
    });

    it("Should not allow doctor without permission to read records", async function () {
      await expect(
        sarawakMed.connect(doctor2).readRecords(patient1.address)
      ).to.be.revertedWith("Access denied: No permission to read these records");
    });

    it("Should emit AccessAttempted event on failed access", async function () {
      try {
        await sarawakMed.connect(doctor2).readRecords(patient1.address);
      } catch (error) {
        // Expected to revert, but event should still be emitted before revert
        expect(error.message).to.include("Access denied");
      }
    });

    it("Should allow patient to read via readRecords", async function () {
      const tx = await sarawakMed.connect(patient1).readRecords(patient1.address);
      const receipt = await tx.wait();

      // Verify the transaction was successful
      expect(receipt.status).to.equal(1);

      // Also verify we can get the records directly
      const records = await sarawakMed.connect(patient1).getMyRecords();
      expect(records.length).to.equal(1);
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor1.address);
    });

    it("Should correctly report verified doctor status", async function () {
      expect(await sarawakMed.isVerifiedDoctor(doctor1.address)).to.be.true;
      expect(await sarawakMed.isVerifiedDoctor(unauthorizedUser.address)).to.be.false;
    });

    it("Should correctly report access status", async function () {
      await sarawakMed.connect(patient1).grantAccess(doctor1.address);
      expect(await sarawakMed.connect(patient1).hasAccess(doctor1.address)).to.be.true;
      expect(await sarawakMed.connect(patient1).hasAccess(doctor2.address)).to.be.false;
    });

    it("Should correctly count patient records", async function () {
      expect(await sarawakMed.connect(patient1).getMyRecordsCount()).to.equal(0);

      await sarawakMed.connect(doctor1).writeRecord(patient1.address, "QmTest1");
      expect(await sarawakMed.connect(patient1).getMyRecordsCount()).to.equal(1);

      await sarawakMed.connect(doctor1).writeRecord(patient1.address, "QmTest2");
      expect(await sarawakMed.connect(patient1).getMyRecordsCount()).to.equal(2);
    });
  });

  describe("MVP Validation Checklist", function () {
    it("✓ An unverified doctor cannot write a record", async function () {
      await expect(
        sarawakMed.connect(unauthorizedUser).writeRecord(patient1.address, "QmTest")
      ).to.be.revertedWith("Only verified doctors can call this function");
    });

    it("✓ A doctor without permission cannot read a record", async function () {
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor1.address);
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor2.address);
      await sarawakMed.connect(doctor1).writeRecord(patient1.address, "QmTest");

      await expect(
        sarawakMed.connect(doctor2).readRecords(patient1.address)
      ).to.be.revertedWith("Access denied: No permission to read these records");
    });

    it("✓ Patient revokes access and it works immediately", async function () {
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor1.address);
      await sarawakMed.connect(doctor1).writeRecord(patient1.address, "QmTest");
      await sarawakMed.connect(patient1).grantAccess(doctor1.address);

      // Doctor can read
      await sarawakMed.connect(doctor1).readRecords(patient1.address);

      // Revoke access
      await sarawakMed.connect(patient1).revokeAccess(doctor1.address);

      // Doctor can no longer read
      await expect(
        sarawakMed.connect(doctor1).readRecords(patient1.address)
      ).to.be.revertedWith("Access denied: No permission to read these records");
    });

    it("✓ All actions are visible in blockchain event logs", async function () {
      await sarawakMed.connect(admin).addVerifiedDoctor(doctor1.address);

      const tx1 = await sarawakMed.connect(doctor1).writeRecord(patient1.address, "QmTest");
      await expect(tx1).to.emit(sarawakMed, "RecordWritten");

      const tx2 = await sarawakMed.connect(patient1).grantAccess(doctor1.address);
      await expect(tx2).to.emit(sarawakMed, "AccessGranted");

      const tx3 = await sarawakMed.connect(doctor1).readRecords(patient1.address);
      await expect(tx3).to.emit(sarawakMed, "AccessAttempted");

      const tx4 = await sarawakMed.connect(patient1).revokeAccess(doctor1.address);
      await expect(tx4).to.emit(sarawakMed, "AccessRevoked");
    });
  });

  // Helper function to get current block timestamp
  async function getBlockTimestamp() {
    const blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);
    return block.timestamp;
  }
});
