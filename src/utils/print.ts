const printTitle = (str: string = ""): void => {
  const columns = process.stdout.columns;
  const robotTotalNum = Math.floor((columns - str.length * 2 - 2) / 2);
  const isDivisible = robotTotalNum % 2 === 0;
  const robotSideNum = Math.ceil(robotTotalNum / 2);
  console.info(
    `\n${"🤖".repeat(isDivisible ? robotSideNum : robotSideNum - 1)}` +
    ` \x1b[1;37m${str}\x1b[0m ` +
    "🤖".repeat(robotSideNum)
  );
};

export type PrintType = "success" | "error" | "puzzle" | "shock" | "brain" | "rocket" | "ghost" | "demon" | "mage";

const printInfo = (str: string = "", type: PrintType): void => {
  const emojiMap: Record<PrintType, string> = {
    success: "🤗",
    error: "😭",
    puzzle: "😯",
    shock: "😮",
    brain: "🤓",
    rocket: "🚀",
    ghost: "👻",
    demon: "👹",
    mage: "🧙"
  };
  const emoji = emojiMap[type] ? emojiMap[type] + " " : "";
  let text = `${emoji}${str}`;
  if (type === "error") {
    text = `\x1b[31m${text}\x1b[0m`;
  } else if (["success", "rocket"].includes(type)) {
    text = `\x1b[32m${text}\x1b[0m`;
  }
  console.info(text);
};

export { printTitle, printInfo };
