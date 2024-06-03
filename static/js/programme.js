(function() {
    'use strict';

    angular.module('programme', ['ngSanitize', 'hc.marked', 'ngLocale', 'ngAnimate', 'ui.bootstrap', 'ui.calendar'])
        .controller('ProgrammeCtrl', ['$scope', '$http', '$q', 'marked', 'dateFilter', '$uibModal', 'uiCalendarConfig', '$window', '$filter', function($scope, $http, $q, marked, dateFilter, $uibModal, uiCalendarConfig, $window, $filter) {

            var moment = $window.moment;

            var formatDefinitions = this.formatDefinitions = [
                {format: 'Conférence', label: 'Conférence', icon: 'fa-slideshare'},
                {format: 'Tool in action', label: 'Tool in Action', icon: 'fa-wrench'},
                {format: 'Université', label: 'Université', icon: 'fa-terminal'},
                {format: 'Quicky', label: 'Quickie', icon: 'fa-clock-o'},
                {format: 'Lab', label: 'Lab', icon: 'fa-flask'},
                {format: 'Keynote', label: 'Keynote', icon: 'fa-user'},
                {format: 'Party', label: 'Party', 'icon': 'fa-glass'},
                {format: 'Eat', label: 'Repas', 'icon': 'fa-cutlery'},
            ];

            var categoryColors = this.categoryColors = {
                'IoT Embarqué': '#186a5d',
                'Méthodologie': '#C9880F',
                'Data': '#BB283C',
                'Architecture': '#6B4162',
                'Développement': '#3366ff',
                'Web': '#2e9eb7',
                'Mobile': '#ff99ff',
                'Keynote': '#F55E52',
                'IA': '#D5B900',
                'Écoconception': '#8FC93A',
                'DevOps': '#774E24',
                'Sécurité': '#000000',
                'Eat': '#00c96b',
                'Autre...': '#AAAAAA'
            };

            var rooms = this.rooms = {
                'Amphi A': 'Amphi A',
                'Amphi B': 'Amphi B',
                'Amphi C': 'Amphi C',
                'Amphi D': 'Amphi D',
                'Amphi E': 'Amphi E',
                'Hall': 'Hall'
            };

            var formats = _.indexBy(formatDefinitions, 'format');

            var startDate = PROGRAMME_CONFIG.start,
                endDate = PROGRAMME_CONFIG.end;
            var startMoment = moment(startDate),
                endMoment = moment(endDate).add(1, 'd'),
                now = moment();

            var defaultDate = (now.isBefore(startMoment) || now.isAfter(endMoment)) ? startDate : now.format('YYYY-MM-DD');

            function renderTitle(event) {
                var format = formats[event.format];
                return '<span class="fa-stack" title="' + format.label + '">' +
                    '<i class="fa fa-square fa-stack-2x"></i>' +
                    '<i style="color:' + event.color + ';" class="fa fa-stack-1x ' + format.icon + '"></i> ' +
                    '</span> ' + event.title +
                    (event.room ? ' <em>(' + event.room + ')</em>' : '') +
                    (event.slides_url ? ' <i class="fa fa-fw fa-file-powerpoint-o"></i>' : '') +
                    (event.files_url ? ' <i class="fa fa-fw fa-file-archive-o"></i>' : '') +
                    (event.video_url ? ' <i class="fa fa-fw fa-film"></i>' : '');
            }

            function refreshCalendar(calendar) {
                if (uiCalendarConfig.calendars[calendar]) {
                    uiCalendarConfig.calendars[calendar].fullCalendar('refetchEvents');
                }
            }

            var PDFDocument = $window.PDFDocument;

            var doc = new PDFDocument();
            var stream = doc.pipe(blobStream());

            this.calendarConfig = {
                defaultDate: defaultDate,
                defaultView: 'agendaDay',
                slotEventOverlap: false,
                slotDuration: '00:15:00',
                editable: false,
                header: {
                    left: '',
                    center: '',
                    right: 'prev,next'
                },
                titleFormat: {
                    day: ''
                },
                columnFormat: {
                    day: ''
                },
                allDaySlot: false,
                minTime: '08:30:00',
                maxTime: '21:00:00',
                axisFormat: 'HH:mm',
                contentHeight: 1275,
                height: 1275,
                timeFormat: {
                    agenda: 'HH:mm'
                },
                eventClick: function(calEvent) {
                    this.details(calEvent);
                }.bind(this),
                eventOrder: 'room',
                eventRender: function(event, element) {
                    element.find('.fc-title').html(renderTitle(event));
                    element.attr('title', event.title); // pour voir le titre en tooltip
                }
            };

            // filters key must match the event property the filter object aim to filter
            var filters = this.filters = {};
            // Category filter
            var categories = _.keys(categoryColors);
            filters.category = _.object(categories, _.map(categories, function() {
                return false;
            }));
            // Format filter
            filters.format = _.mapValues(formats, false);
            filters.room = _.mapValues(rooms, false);

            var refresh = this.refresh = function() {
                refreshCalendar('calendar');
            };

            this.clearSearch = function() {
                delete this.search;
                refresh();
            }.bind(this);

            // watch filters
            _.each(filters, function(filterObject) {
                $scope.$watchCollection(function() {
                    return filterObject;
                }, refresh);
            });

            var http_talks
                = (PROGRAMME_CONFIG == null || PROGRAMME_CONFIG.get_talks_method === "static")
                ? $http.get('/json/schedule.json')
                : $http({
                        method: 'GET',
                        url: 'https://api.cfp.io/api/schedule',
                        headers: {
                            'X-Tenant-Id': 'breizhcamp'
                        }
                    });

            $q.all([
                $http.get('/json/talks_others.json'),
                http_talks
            ]).then(function(responses) {
                return [].concat(responses[0].data, responses[1].data);
            }).then(function(talks) {

                function activeFilters() {
                    return _.pick(filters, function(filterObject) {
                        return _.any(filterObject, Boolean);
                    });
                }

                this.agenda = {
                    events: function(start, end, timezone, callback) {
                        var filters = activeFilters();
                        callback($filter('filter')(_.filter(_.map(talks, function(talk) {
                            return Object.assign({
                                title: talk.name,
                                format: talk.format,
                                category: talk.event_type,
                                description: talk.description,
                                speakers: talk.speakers ? talk.speakers.replace(/, $/, '') : '',
                                start: talk.event_start,
                                end: talk.event_end,
                                color: categoryColors[talk.event_type] || categoryColors['Autre...'],
                                room: rooms[talk.venue]
                            }, _.pick(talk, ['video_url', 'files_url', 'slides_url']));
                        }), function(talk) {
                            return _.all(filters, function(filter, name) {
                                return filter[talk[name]];
                            });
                        }), this.search));
                    }.bind(this)
                };
            }.bind(this));

            this.details = function(talk) {
                if (!talk.speakers || !talk.description) { // no detail if there is no description or no speaker
                    return;
                }
                $uibModal.open({
                    template: '<div class="modal-header">' +
                    '<button type="button" class="close" ng-click="$close()"><span>&times;</span></button>' +
                    '<h3 class="modal-title">' +
                    '<span class="fa-stack" title="{{::detailsCtrl.formats[detailsCtrl.talk.format].label}}">' +
                    '<i class="fa fa-square fa-stack-2x"></i>' +
                    '<i class="fa fa-stack-1x fa-inverse" ng-class="::detailsCtrl.formats[detailsCtrl.talk.format].icon"></i>' +
                    '</span>' +
                    '<span ng-bind="::detailsCtrl.talk.title"></span>' +
                    ' <a ng-href="{{::detailsCtrl.talk.slides_url}}" ng-if="::detailsCtrl.talk.slides_url" title="Voir les slides" target="_blank"><i class="fa fa-fw fa-file-powerpoint-o"></i></a> ' +
                    ' <a ng-href="{{::detailsCtrl.talk.files_url}}" ng-if="::detailsCtrl.talk.files_url" title="Voir les fichiers" target="_blank"><i class="fa fa-fw fa-file-archive-o"></i></a> ' +
                    ' <a ng-href="{{::detailsCtrl.talk.video_url}}" ng-if="::detailsCtrl.talk.video_url" title="Voir la vidéo" target="_blank"><i class="fa fa-fw fa-film"></i></a> ' +
                    '</h3>' +
                    '</div>' +
                    '<div class="modal-body">' +
                    '<em class="pull-right clearfix" ng-bind="::detailsCtrl.talk.room"></em>' +
                    '<p class="text-muted" ng-bind="::detailsCtrl.talk.category"></p>' +
                    '<div marked="::detailsCtrl.talk.description"></div>' +
                    '<p><strong>Speaker{{::detailsCtrl.talk.speakers.indexOf(\',\') !== -1 ? \'s\' : \'\'}}</strong>&nbsp;: {{::detailsCtrl.talk.speakers}}</p>' +
                    '</div>',
                    controller: function() {
                        this.talk = talk;
                        this.formats = formats;
                    },
                    controllerAs: 'detailsCtrl'
                });
            };
        }]);
})();
