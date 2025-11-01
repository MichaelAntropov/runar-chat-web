<script setup lang="ts"></script>

<template>
  <div class="overlay" id="loadingOverlay">
    <div class="spinner-border text-light" role="status">
      <span class="visually-hidden">Loading...</span>
    </div>
  </div>
</template>

<style>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1050; /* above modal backdrop */
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
