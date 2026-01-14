const { ethers } = require("hardhat");

async function main() {
  const [admin, doctor1, doctor2, patient1] = await ethers.getSigners();

  console.log('=== Testing Backend Authentication ===\n');

  // Test 1: Request without auth headers
  console.log('Test 1: Request without auth (should fail)');
  try {
    const res1 = await fetch('http://localhost:3001/api/upload/retrieve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ipfsHash: 'QmTest', encryptionKey: 'abc' })
    });
    const data1 = await res1.json();
    console.log(`  Status: ${res1.status}`);
    console.log(`  Response: ${data1.error}`);
    console.log(res1.status === 401 ? '  ✓ PASS: Auth required\n' : '  ✗ FAIL\n');
  } catch (e) {
    console.log(`  Error: ${e.message}\n`);
  }

  // Test 2: Request with invalid signature
  console.log('Test 2: Request with invalid signature');
  try {
    const res2 = await fetch('http://localhost:3001/api/upload/retrieve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': doctor1.address,
        'x-wallet-signature': '0xinvalidsignature',
        'x-wallet-timestamp': Math.floor(Date.now() / 1000).toString(),
        'x-wallet-action': 'retrieve'
      },
      body: JSON.stringify({ ipfsHash: 'QmTest', encryptionKey: 'abc', patientAddress: patient1.address })
    });
    const data2 = await res2.json();
    console.log(`  Status: ${res2.status}`);
    console.log(`  Response: ${data2.error}`);
    console.log(res2.status === 401 ? '  ✓ PASS: Invalid signature rejected\n' : '  ✗ FAIL\n');
  } catch (e) {
    console.log(`  Error: ${e.message}\n`);
  }

  // Test 3: Request with expired timestamp
  console.log('Test 3: Request with expired timestamp (10 min old)');
  try {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const message = `SarawakMedChain:retrieve:${oldTimestamp}`;
    const signature = await doctor1.signMessage(message);

    const res3 = await fetch('http://localhost:3001/api/upload/retrieve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': doctor1.address,
        'x-wallet-signature': signature,
        'x-wallet-timestamp': oldTimestamp.toString(),
        'x-wallet-action': 'retrieve'
      },
      body: JSON.stringify({ ipfsHash: 'QmTest', encryptionKey: 'abc', patientAddress: patient1.address })
    });
    const data3 = await res3.json();
    console.log(`  Status: ${res3.status}`);
    console.log(`  Response: ${data3.error}`);
    console.log(res3.status === 401 ? '  ✓ PASS: Expired timestamp rejected\n' : '  ✗ FAIL\n');
  } catch (e) {
    console.log(`  Error: ${e.message}\n`);
  }

  // Test 4: Valid signature but no blockchain permission
  console.log('Test 4: Valid signature but no blockchain permission');
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `SarawakMedChain:retrieve:${timestamp}`;
    const signature = await doctor2.signMessage(message);

    const res4 = await fetch('http://localhost:3001/api/upload/retrieve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': doctor2.address,
        'x-wallet-signature': signature,
        'x-wallet-timestamp': timestamp.toString(),
        'x-wallet-action': 'retrieve'
      },
      body: JSON.stringify({ ipfsHash: 'QmTest', encryptionKey: 'abc', patientAddress: patient1.address })
    });
    const data4 = await res4.json();
    console.log(`  Status: ${res4.status}`);
    console.log(`  Response: ${data4.error || data4.message}`);
    console.log(res4.status === 403 ? '  ✓ PASS: No blockchain permission\n' : '  ✗ FAIL\n');
  } catch (e) {
    console.log(`  Error: ${e.message}\n`);
  }

  // Test 5: Patient accessing own records (self-access)
  console.log('Test 5: Patient self-access (should pass auth, fail on IPFS)');
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `SarawakMedChain:retrieve:${timestamp}`;
    const signature = await patient1.signMessage(message);

    const res5 = await fetch('http://localhost:3001/api/upload/retrieve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': patient1.address,
        'x-wallet-signature': signature,
        'x-wallet-timestamp': timestamp.toString(),
        'x-wallet-action': 'retrieve'
      },
      body: JSON.stringify({ ipfsHash: 'QmFakeHash123', encryptionKey: 'abc', patientAddress: patient1.address })
    });
    const data5 = await res5.json();
    console.log(`  Status: ${res5.status}`);
    console.log(`  Response: ${data5.error || data5.message}`);
    // Should pass auth (self-access) but fail on IPFS (fake hash)
    const passed = res5.status === 500 && data5.message.includes('IPFS');
    console.log(passed ? '  ✓ PASS: Auth passed, failed on IPFS (expected)\n' : '  ✗ FAIL\n');
  } catch (e) {
    console.log(`  Error: ${e.message}\n`);
  }

  // Test 6: Upload without being verified doctor
  console.log('Test 6: Upload by non-verified address');
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `SarawakMedChain:upload:${timestamp}`;
    const signature = await patient1.signMessage(message); // Patient trying to upload

    const formData = new FormData();
    formData.append('patientAddress', patient1.address);

    const res6 = await fetch('http://localhost:3001/api/upload/medical-record', {
      method: 'POST',
      headers: {
        'x-wallet-address': patient1.address,
        'x-wallet-signature': signature,
        'x-wallet-timestamp': timestamp.toString(),
        'x-wallet-action': 'upload'
      },
      body: formData
    });
    const data6 = await res6.json();
    console.log(`  Status: ${res6.status}`);
    console.log(`  Response: ${data6.error}`);
    console.log(res6.status === 403 ? '  ✓ PASS: Non-doctor rejected\n' : '  ✗ FAIL\n');
  } catch (e) {
    console.log(`  Error: ${e.message}\n`);
  }

  console.log('=== Auth Tests Complete ===');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
