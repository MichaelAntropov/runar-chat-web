<script setup lang="ts">
import NavBar from './NavBar.vue'
</script>

<template>
  <header>
    <NavBar />
  </header>
  <main>
    <div class="container d-flex justify-content-center align-items-center vh-100">
      <div class="text-center">
        <h1>Quarkus Chat</h1>
        <p>Chat application using Java Quarkus framework, Vue.js, etc.</p>
        <p>
          <a class="btn btn-lg btn-primary">Start chat</a>
        </p>
      </div>
    </div>
  </main>
</template>
