# Open app FX

* load data.json and check with localstorage internal comics. if different, load and save single ones in localstorage
* load localstorage external comics, for each check directory exists and load comic



# Init

* start server
* load splashscreen.html
* load all internal comics FX
* load all external comics FX
* load index.html


# Load all internal comics FX

* load data.json
* check with localstorage internal comics
* for each entry
  * if slug or version is different, load its comic.json into localstorage or delete the entry from localstorage
  * mount directory
  * save in localstorage



# Load all external comics FX

* read localstorage external comics into variable
* for each entry
  * check if directory exists
  * mount directory
  * save in localstorage



# Add internal comic FX

* already checked that the directory exists
* check comic.json file exists
* read comic.json and save it in localstorage internal comics
* mount directory



# Add url FX

* download file
* unzip file
* add internal comic FX



# Add comic directory FX

* already checked that the directory exists
* check comic.json file exists
* read comic.json and save it in localstorage external comics
* mount directory



# Add to library UI

* add item in the library section page with ajax



# Add url comic UI

* write url UI
* select where to save UI
* check we are not overwriting - rename - rechoose
* add url FX
* add to library UI



# Add local comic UI

* select directory to load
* check it's not already open
* add comic directory FX
* add to library UI