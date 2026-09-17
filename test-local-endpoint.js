fetch('http://localhost:3000/api/create-subscription', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: "test_user_id",
    email: "test@test.com",
    name: "Test User",
    billingType: "PIX"
  })
}).then(async res => {
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Body:", text);
}).catch(console.error);
