# Electric Field Visualiser

<div align="center">

**An interactive, high-performance simulation for exploring Coulomb’s Law and electric field superposition in an infinite 2D space.**

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

</div>

---

##Visit the Site below:
https://mafimatiks.github.io/ElectricField/

## ✨ Key Features

### 🔬 Interactive physics

Real-time electric field **E** from **point charges** using Coulomb superposition. Vectors show **direction** and **relative strength**.

### Infinite canvas

**Pan** across an unbounded world-aligned grid: field samples update as you move so the vector field stays coherent. Middle-mouse drag pans the view; world coordinates are shown in the **HUD**.


### Optimised rendering

**Viewport culling**, **batched** arrow drawing, **field caching** while panning (no drag), **offscreen** background, and **Δt-based** smoothing for stable **60 FPS** on typical hardware.

---

## 🧱 Tech stack

| Layer | Choice |
|--------|--------|
| UI | React 18 |
| Build | Vite 6 |
| Styling | Tailwind CSS |
| Drawing | HTML5 Canvas 2D |

---

## 🚀 Getting started

### Prerequisites

- **Node.js** 18+ (20 LTS recommended)

### Install & run locally

```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

### Build for production

```bash
npm run build
```

Output is written to `dist/`.

### Preview the production build

```bash
npm run preview
```

---

## 📦 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Type-check-free production bundle to `dist/` |
| `npm run preview` | Serve `dist/` locally |

## 🎮 Controls (quick reference)

| Action | Input |
|--------|--------|
| Place charge | Left-click empty space |
| Move charge | Drag |
| Select / remove | Click charge → **Remove** or **Delete** / **Backspace** |
| Pan view | **Middle mouse** drag |
| Reset camera | **Reset view** (corner HUD) |

---

## 📄 License

MIT

---

<p align="center">
  Built with React · Vite · Canvas · Tailwind
</p>
