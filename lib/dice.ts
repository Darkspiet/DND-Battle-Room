export type DiceResult = {
  expression: string;
  total: number;
  parts: string;
};

const DICE_PATTERN = /^(\d*)d(4|6|8|10|12|20|100)([+-]\d+)?$/i;

export function rollDice(input: string): DiceResult {
  const expression = input.replace(/\s+/g, "").toLowerCase();
  const match = expression.match(DICE_PATTERN);

  if (!match) {
    throw new Error("Use dice like d20, 2d6, or 1d8+3.");
  }

  const count = Number(match[1] || "1");
  const sides = Number(match[2]);
  const modifier = Number(match[3] || "0");

  if (count < 1 || count > 20) {
    throw new Error("Roll between 1 and 20 dice at once.");
  }

  const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
  const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier;
  const modText = modifier === 0 ? "" : modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;

  return {
    expression,
    total,
    parts: `[${rolls.join(", ")}]${modText}`
  };
}
