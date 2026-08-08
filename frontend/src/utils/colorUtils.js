export const getSellThroughColorConfig = (val) => {
  let cleaned = val;
  if (typeof val === "string") {
    cleaned = val.replace("%", "").trim();
  }
  if (cleaned === null || cleaned === undefined || cleaned === "" || cleaned === "-" || Number(cleaned) === 0 || isNaN(Number(cleaned))) {
    return {
      fill: "ECEFF1",
      font: "6B7280",
      rgbFill: [236, 239, 241],
      rgbFont: [107, 114, 128]
    };
  }
  const num = Number(val);
  if (num >= 80) {
    return {
      fill: "BBDEFB",
      font: "1565C0",
      rgbFill: [187, 222, 251],
      rgbFont: [21, 101, 192]
    };
  } else if (num >= 60) {
    return {
      fill: "DCEDC8",
      font: "2E7D32",
      rgbFill: [220, 237, 200],
      rgbFont: [46, 125, 50]
    };
  } else if (num >= 40) {
    return {
      fill: "FFE0B2",
      font: "FF8F00",
      rgbFill: [255, 224, 178],
      rgbFont: [255, 143, 0]
    };
  } else {
    return {
      fill: "FFCDD2",
      font: "C62828",
      rgbFill: [255, 205, 210],
      rgbFont: [198, 40, 40]
    };
  }
};
