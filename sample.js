(async () => {
  const token = await (
    await fetch("https://matchmaker.krunker.io/generate-token")
  ).arrayBuffer();

  // https://work.ink/4lH/krunker
  const apiToken = "d7350372-f15d-4599-9b83-a742dfef9b66";

  const validRes = await fetch("http://[::1]:3001/valid", {
    method: "POST",
    body: apiToken,
    headers: {
      "content-type": "text/plain",
    },
  });

  if (!validRes) throw new Error("Invalid work.ink token");

  const hashRes = await fetch("http://[::1]:3001/hash", {
    method: "POST",
    body: token,
    headers: {
      "x-token": apiToken,
      "content-type": "text/plain",
    },
  });

  const hashed = await hashRes.text();

  console.log({ hashed });

  if (!hashRes.ok) return;

  const seekGame = await fetch(
    `https://matchmaker.krunker.io/seek-game?${new URLSearchParams({
      hostname: "krunker.io",
      region: "us-nj",
      autoChangeGame: "false",
      validationToken: hashed
        .split("")
        .map((argInstantPlease) =>
          String.fromCharCode(argInstantPlease.charCodeAt(0) - 10)
        )
        .join(""),
      dataQuery: JSON.stringify({ v: "dqk8nbmX7Juu0f4b62wtlwM6pw8ytLHG" }),
    })}`
  );

  console.log(
    "Response from seek-game:",
    seekGame.status,
    await seekGame.json().catch(() => Symbol("INVALID JSON"))
  );
})();
