<?php
declare(strict_types=1);
require_once __DIR__ . '/../app/bootstrap.php';

Auth::logout();
Http::redirect('/login.php');

/*
 * WHAT THIS PAGE DOES (in plain language)
 * ----------------------------------------
 * This isn't a page a user sees - it's a one-step "sign me out" action.
 * When someone clicks a "Logout" link/button, the browser is sent here.
 * It clears the user's login session (Auth::logout) and then immediately
 * bounces them back to the login page (Http::redirect), so they can't
 * keep using the app until they sign in again.
 */
