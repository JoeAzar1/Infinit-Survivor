# Infinite Survivor

Petit jeu 2D HTML/CSS/JavaScript avec classement PHP.

## Fonctionnement
- Le joueur se déplace à gauche/droite et saute.
- Les mines au sol s'arment lorsque le joueur entre dans leur proximité puis explosent 0,5 s plus tard.
- Les boules de feu poursuivent le joueur à environ 50 % de la vitesse maximale du personnage.
- Le monde est généré progressivement à mesure que le joueur avance.
- Le compteur affiche la distance parcourue en mètres.
- À la mort, le meilleur score atteint est affiché et peut être enregistré dans le classement.
- Le meilleur score local est conservé dans `localStorage`.

## Lancer le projet
Le front peut être ouvert en statique pour jouer, mais les scores PHP nécessitent un serveur PHP.

Avec PHP installé :

```bash
php -S localhost:8000
```

Puis ouvrir `http://localhost:8000/`.

## Fichiers
- `index.html` : interface et HUD.
- `style.css` : style de l'interface.
- `game.js` : moteur du jeu, physique, génération procédurale et collisions.
- `save_score.php` : enregistre un score.
- `scores.php` : renvoie les 10 meilleurs scores.
- `scores.json` : stockage simple du classement.
