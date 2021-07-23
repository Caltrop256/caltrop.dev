CREATE DATABASE meta;
use meta;

DROP TABLE `analytics.event.pageview`;


CREATE TABLE IF NOT EXISTS `analytics` (
	`id` CHAR(44) CHARACTER SET ascii NOT NULL,
	`timestamp` TIMESTAMP NOT NULL,
    `ip` VARCHAR(45) CHARACTER SET ascii,
    `domain` VARCHAR(64) CHARACTER SET ascii NOT NULL,
    `location` VARCHAR(512) CHARACTER SET ascii NOT NULL,
    `userAgent` VARCHAR(512) CHARACTER SET ascii,
    `referer` VARCHAR(512),
    `method` VARCHAR(15) NOT NULL,
    `sessionLength` INT UNSIGNED,
    PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `analytics.event.pageview` (
	`id` CHAR(44) CHARACTER SET ascii NOT NULL,
	`timestamp` TIMESTAMP NOT NULL,
    `width` INT UNSIGNED NOT NULL,
    `headless` BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS `analytics.event.link` (
	`id` CHAR(44) CHARACTER SET ascii NOT NULL,
    `timestamp` TIMESTAMP NOT NULL,
    `outbound` BOOLEAN NOT NULL,
    `target` VARCHAR(512) CHARACTER SET ascii NOT NULL,
    `newTab` BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS `analytics.event.pageexit` (
	`id` CHAR(44) CHARACTER SET ascii NOT NULL,
    `timestamp` TIMESTAMP NOT NULL
);

DESCRIBE `analytics.event.pageexit`;

SELECT * FROM `analytics.event.pageexit`;

SELECT * FROM `analytics`
LEFT JOIN `analytics.event.pageview` ON `analytics`.id = `analytics.event.pageview`.id
LEFT JOIN `analytics.event.pageexit` ON `analytics`.id = `analytics.event.pageexit`.id;

SELECT * FROM `analytics`  ORDER BY `timestamp`;