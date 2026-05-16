"use client";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_MAP_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_SIZE = 256;
const MAX_MAP_IMAGE_SIZE = 1800;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export type TokenImage = {
  imageUrl: string;
  imageName: string;
};

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the image file."));
    image.src = dataUrl;
  });
}

export async function prepareTokenImage(file: File): Promise<TokenImage> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Use a PNG, JPG, WebP, or GIF image.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Token pictures must be 2 MB or smaller.");
  }

  const dataUrl = await readAsDataUrl(file);

  if (file.type === "image/gif") {
    return { imageUrl: dataUrl, imageName: file.name };
  }

  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.floor((image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.floor((image.naturalHeight - sourceSize) / 2);
  const outputSize = Math.min(MAX_IMAGE_SIZE, sourceSize);

  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser cannot process the image.");
  }

  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize);

  return {
    imageUrl: canvas.toDataURL("image/webp", 0.86),
    imageName: file.name
  };
}

export async function prepareBattleMapImage(file: File): Promise<TokenImage> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("Use a PNG, JPG, WebP, or GIF image.");
  }

  if (file.size > MAX_MAP_UPLOAD_BYTES) {
    throw new Error("Battlefield backgrounds must be 8 MB or smaller.");
  }

  const dataUrl = await readAsDataUrl(file);

  if (file.type === "image/gif") {
    return { imageUrl: dataUrl, imageName: file.name };
  }

  const image = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_MAP_IMAGE_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
  const outputWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const outputHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser cannot process the image.");
  }

  context.drawImage(image, 0, 0, outputWidth, outputHeight);

  return {
    imageUrl: canvas.toDataURL("image/webp", 0.82),
    imageName: file.name
  };
}
