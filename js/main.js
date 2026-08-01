document.addEventListener("DOMContentLoaded", () => {
  loadComponent("sidebar", "/components/sidebar.html");
  loadComponent("navbar", "/components/navbar.html");
});

function loadComponent(id, path) {
  fetch(path)
    .then(res => res.text())
    .then(html => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    })
    .catch(err => console.error(`Error loading ${id}:`, err));
}