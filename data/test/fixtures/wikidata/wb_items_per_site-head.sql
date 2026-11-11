/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.19-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: dbstore1009.eqiad.wmnet    Database: wikidatawiki
-- ------------------------------------------------------
-- Server version	10.11.13-MariaDB-log

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `wb_items_per_site`
--

DROP TABLE IF EXISTS `wb_items_per_site`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wb_items_per_site` (
  `ips_row_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `ips_item_id` int(10) unsigned NOT NULL,
  `ips_site_id` varbinary(32) NOT NULL,
  `ips_site_page` varbinary(310) NOT NULL,
  PRIMARY KEY (`ips_row_id`),
  UNIQUE KEY `wb_ips_item_site_page` (`ips_site_id`,`ips_site_page`),
  KEY `wb_ips_item_id` (`ips_item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=632055510 DEFAULT CHARSET=binary ROW_FORMAT=COMPRESSED;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wb_items_per_site`
--

/*!40000 ALTER TABLE `wb_items_per_site` DISABLE KEYS */;
INSERT INTO `wb_items_per_site` VALUES
(55,3596065,'abwiki','Џьгьарда'),
(58,3596033,'abwiki','Аацы'),
(76,620894,'abwiki','Агәы-Бедиа'),
(228,621901,'abwiki','Ахәри'),
(285,621898,'abwiki','Аҽгәара'),
(299,621890,'abwiki','Баслахә'),
(310,3596028,'abwiki','Блабырхәа'),
(346,620880,'abwiki','Галхәыч');
/*!40000 ALTER TABLE `wb_items_per_site` ENABLE KEYS */;
