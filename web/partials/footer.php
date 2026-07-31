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
<?php
/*
 * WHAT THIS FILE DOES (in plain language)
 * ----------------------------------------
 * This is the closing half of partials/header.php - together they
 * "wrap" every server-rendered page's content. Whatever a page prints
 * between including header.php and footer.php becomes the main content
 * area; this file just closes the layout tags and adds one small
 * script that lets the hamburger menu button open/close the sidebar on
 * narrow (mobile) screens.
 */
