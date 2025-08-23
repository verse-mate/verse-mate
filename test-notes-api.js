#!/usr/bin/env node

const BASE_URL = "http://localhost:4000";
const AUTH_TOKEN = "mock-dev-token"; // Based on memory of local dev setup

async function testNotesAPI() {
  console.log("🧪 Testing Notes CRUD API...\n");

  // First check if server is running
  console.log("0. Checking server connectivity...");
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const healthCheck = await fetch(`${BASE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    console.log(`   Server status: ${healthCheck.status} ✅`);
  } catch (error) {
    console.log(`   ❌ Server not accessible: ${error.message}`);
    console.log("   Make sure backend is running on port 4000");
    return;
  }

  // Test 1: Unauthorized access (should fail)
  console.log("\n1. Testing unauthorized access...");
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${BASE_URL}/api/notes/Matthew/1`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    console.log(
      `   Status: ${response.status} - ${response.status === 401 ? "✅ PASS" : "❌ FAIL"}`,
    );
  } catch (error) {
    console.log(`   ❌ Connection error: ${error.message}`);
    return;
  }

  // Test 2: Get notes for Matthew chapter 1 (should return empty array initially)
  console.log("\n2. Testing GET notes for Matthew 1...");
  try {
    const response = await fetch(`${BASE_URL}/api/notes/Matthew/1`, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();
    console.log(
      `   Status: ${response.status} - ${response.status === 200 ? "✅ PASS" : "❌ FAIL"}`,
    );
    console.log(`   Notes found: ${data.length || 0}`);
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 3: Create a new note
  console.log("\n3. Testing POST create note...");
  let noteId = null;
  try {
    const response = await fetch(`${BASE_URL}/api/notes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bookName: "Matthew",
        chapterNumber: 1,
        content: "Test note for API verification",
      }),
    });
    const data = await response.json();
    console.log(
      `   Status: ${response.status} - ${response.status === 201 ? "✅ PASS" : "❌ FAIL"}`,
    );
    if (data.note_id) {
      noteId = data.note_id;
      console.log(`   Created note ID: ${noteId}`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 4: Get notes again (should now have 1 note)
  console.log("\n4. Testing GET notes after creation...");
  try {
    const response = await fetch(`${BASE_URL}/api/notes/Matthew/1`, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();
    console.log(
      `   Status: ${response.status} - ${response.status === 200 ? "✅ PASS" : "❌ FAIL"}`,
    );
    console.log(`   Notes found: ${data.length || 0}`);
    if (data.length > 0) {
      console.log(`   Note content: "${data[0].content}"`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 5: Update the note
  if (noteId) {
    console.log("\n5. Testing PUT update note...");
    try {
      const response = await fetch(`${BASE_URL}/api/notes/${noteId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "Updated test note content",
        }),
      });
      const data = await response.json();
      console.log(
        `   Status: ${response.status} - ${response.status === 200 ? "✅ PASS" : "❌ FAIL"}`,
      );
      if (data.content) {
        console.log(`   Updated content: "${data.content}"`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  // Test 6: Delete the note
  if (noteId) {
    console.log("\n6. Testing DELETE note...");
    try {
      const response = await fetch(`${BASE_URL}/api/notes/${noteId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${AUTH_TOKEN}`,
          "Content-Type": "application/json",
        },
      });
      console.log(
        `   Status: ${response.status} - ${response.status === 200 ? "✅ PASS" : "❌ FAIL"}`,
      );
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  // Test 7: Verify note is deleted
  console.log("\n7. Testing GET notes after deletion...");
  try {
    const response = await fetch(`${BASE_URL}/api/notes/Matthew/1`, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();
    console.log(
      `   Status: ${response.status} - ${response.status === 200 ? "✅ PASS" : "❌ FAIL"}`,
    );
    console.log(
      `   Notes found: ${data.length || 0} - ${data.length === 0 ? "✅ PASS (deleted)" : "❌ FAIL (not deleted)"}`,
    );
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log("\n🏁 API testing complete!");
}

// Run the tests
testNotesAPI().catch(console.error);
