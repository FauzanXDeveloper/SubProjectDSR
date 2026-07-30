    </div>
  </main>
</div>
<script>
  (function () {
    var sidebar = document.getElementById('sidebar');
    var menuBtn = document.getElementById('btn-menu');
    if (menuBtn && sidebar) {
      menuBtn.addEventListener('click', function () { sidebar.classList.toggle('open'); });
    }
  })();
</script>
</body>
</html>
